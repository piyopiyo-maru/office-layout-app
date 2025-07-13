# 運用・デプロイメント要件

## 概要

オフィスレイアウト管理システムの運用・デプロイメントは、**Docker化**による環境統一と**軽量運用**を重視した設計となっています。  
データベースサーバー不要の簡単運用と、継続的な保守・監視体制を実現します。

## デプロイメントアーキテクチャ

### システム構成図

```
┌─────────────────────────────────────────────────────────┐
│                   Production Environment                │
│                                                         │
│  ┌─────────────────┐    ┌─────────────────────────────┐  │
│  │   Load Balancer │    │         Monitoring          │  │
│  │   (Optional)    │    │   ・ログ監視               │  │
│  │   ・Nginx       │    │   ・ヘルスチェック         │  │
│  │   ・HAProxy     │    │   ・メトリクス収集         │  │
│  └─────────────────┘    └─────────────────────────────┘  │
│           │                                              │
│  ┌─────────────────────────────────────────────────────┐  │
│  │              Docker Container                       │  │
│  │  ┌─────────────────┐  ┌─────────────────────────────┐ │  │
│  │  │   Application   │  │         Data Volume         │ │  │
│  │  │   ・Node.js     │  │   ・initial_data.json      │ │  │
│  │  │   ・Express     │  │   ・layout_data.json       │ │  │
│  │  │   ・Static Files│  │   ・backup/ (10世代)       │ │  │
│  │  └─────────────────┘  └─────────────────────────────┘ │  │
│  └─────────────────────────────────────────────────────┘  │
│           │                         │                     │
│  ┌─────────────────┐    ┌─────────────────────────────┐  │
│  │   Backup System │    │    External Storage         │  │
│  │   ・定期バックアップ│    │   ・NFS/CIFS               │  │
│  │   ・復旧スクリプト │    │   ・オブジェクトストレージ │  │
│  └─────────────────┘    └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Docker化設計

### Dockerfile 最適化

#### **マルチステージビルド**
```dockerfile
# ベースイメージ: Node.js 18 Alpine（軽量）
FROM node:18-alpine AS base
WORKDIR /usr/src/app

# 依存関係レイヤー（キャッシュ最適化）
FROM base AS dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# 開発依存関係（オプション）
FROM dependencies AS dev-dependencies
RUN npm ci

# アプリケーションレイヤー
FROM base AS application
COPY --from=dependencies /usr/src/app/node_modules ./node_modules
COPY . .

# セキュリティ: 非rootユーザー作成
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# データディレクトリ作成・権限設定
RUN mkdir -p /usr/src/app/data/backup && \
    chown -R nodejs:nodejs /usr/src/app

USER nodejs

# ポート公開
EXPOSE 9000

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').request('http://localhost:9000/health', (res) => { \
        process.exit(res.statusCode === 200 ? 0 : 1) \
    }).on('error', () => process.exit(1)).end()"

# 起動コマンド
CMD ["node", "server.js"]
```

#### **軽量イメージ最適化**
```dockerfile
# プロダクション用最小イメージ
FROM node:18-alpine AS production

# セキュリティアップデート
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init && \
    rm -rf /var/cache/apk/*

WORKDIR /usr/src/app

# 非rootユーザーでの実行
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# 必要ファイルのみコピー
COPY --from=dependencies --chown=nodejs:nodejs /usr/src/app/node_modules ./node_modules
COPY --chown=nodejs:nodejs package*.json ./
COPY --chown=nodejs:nodejs server.js ./
COPY --chown=nodejs:nodejs public/ ./public/

# データディレクトリ準備
RUN mkdir -p data/backup && \
    chown -R nodejs:nodejs data

USER nodejs

EXPOSE 9000

# dumb-initによるシグナル処理
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
```

### Docker Compose 設定

#### **開発環境用**
```yaml
# docker-compose.dev.yml
version: '3.8'

services:
  office-layout-app:
    build:
      context: .
      dockerfile: Dockerfile
      target: dev-dependencies
    container_name: office-layout-dev
    ports:
      - "9000:9000"
    volumes:
      - .:/usr/src/app
      - node_modules:/usr/src/app/node_modules
      - ./data:/usr/src/app/data
    environment:
      - NODE_ENV=development
      - DEBUG=office-layout:*
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

volumes:
  node_modules:
```

#### **本番環境用**
```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  office-layout-app:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    container_name: office-layout-prod
    ports:
      - "9000:9000"
    volumes:
      - office_data:/usr/src/app/data
      - office_backup:/backup
    environment:
      - NODE_ENV=production
      - PORT=9000
      - MAX_BACKUPS=20
      - CORS_ORIGIN=https://yourdomain.com
    restart: always
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:9000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
        max-file: "3"
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M

  # リバースプロキシ（オプション）
  nginx:
    image: nginx:alpine
    container_name: office-layout-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - office-layout-app
    restart: always

volumes:
  office_data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /opt/office-layout-app/data
  office_backup:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /opt/office-layout-app/backup
```

## 運用スクリプト

### デプロイメント自動化

#### **デプロイスクリプト**
```bash
#!/bin/bash
# deploy.sh - 本番環境デプロイメントスクリプト

set -euo pipefail

# 設定
APP_NAME="office-layout-app"
CONTAINER_NAME="office-layout-prod"
IMAGE_NAME="$APP_NAME:latest"
DATA_DIR="/opt/office-layout-app/data"
BACKUP_DIR="/opt/office-layout-app/backup"
LOG_FILE="/var/log/office-layout-deploy.log"

# ログ関数
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# エラーハンドリング
error_exit() {
    log "ERROR: $1"
    exit 1
}

# メイン処理
main() {
    log "=== Office Layout App Deployment Started ==="
    
    # 事前チェック
    check_prerequisites
    
    # バックアップ作成
    create_backup
    
    # イメージビルド
    build_image
    
    # サービス停止
    stop_service
    
    # コンテナ更新
    update_container
    
    # ヘルスチェック
    health_check
    
    # クリーンアップ
    cleanup
    
    log "=== Deployment Completed Successfully ==="
}

check_prerequisites() {
    log "Checking prerequisites..."
    
    # Docker動作確認
    docker --version >/dev/null 2>&1 || error_exit "Docker is not available"
    
    # データディレクトリ確認
    [ -d "$DATA_DIR" ] || error_exit "Data directory does not exist: $DATA_DIR"
    
    # 権限確認
    [ -w "$DATA_DIR" ] || error_exit "No write permission to data directory"
    
    log "Prerequisites check passed"
}

create_backup() {
    log "Creating backup..."
    
    BACKUP_NAME="backup-$(date '+%Y%m%d-%H%M%S')"
    BACKUP_PATH="$BACKUP_DIR/$BACKUP_NAME"
    
    mkdir -p "$BACKUP_PATH"
    
    # データファイルバックアップ
    if [ -f "$DATA_DIR/initial_data.json" ]; then
        cp "$DATA_DIR/initial_data.json" "$BACKUP_PATH/"
    fi
    
    if [ -f "$DATA_DIR/layout_data.json" ]; then
        cp "$DATA_DIR/layout_data.json" "$BACKUP_PATH/"
    fi
    
    # コンテナイメージバックアップ
    docker save "$IMAGE_NAME" | gzip > "$BACKUP_PATH/image.tar.gz" 2>/dev/null || true
    
    log "Backup created: $BACKUP_PATH"
}

build_image() {
    log "Building Docker image..."
    
    docker build -t "$IMAGE_NAME" . || error_exit "Image build failed"
    
    log "Image built successfully"
}

stop_service() {
    log "Stopping existing service..."
    
    if docker ps -q -f name="$CONTAINER_NAME" | grep -q .; then
        docker stop "$CONTAINER_NAME" || error_exit "Failed to stop container"
        docker rm "$CONTAINER_NAME" || error_exit "Failed to remove container"
        log "Service stopped"
    else
        log "Service is not running"
    fi
}

update_container() {
    log "Starting new container..."
    
    docker run -d \
        --name "$CONTAINER_NAME" \
        -p 9000:9000 \
        -v "$DATA_DIR:/usr/src/app/data" \
        -e NODE_ENV=production \
        --restart always \
        "$IMAGE_NAME" || error_exit "Failed to start container"
        
    log "Container started"
}

health_check() {
    log "Performing health check..."
    
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -f http://localhost:9000/health >/dev/null 2>&1; then
            log "Health check passed"
            return 0
        fi
        
        attempt=$((attempt + 1))
        log "Health check attempt $attempt/$max_attempts failed, retrying..."
        sleep 2
    done
    
    error_exit "Health check failed after $max_attempts attempts"
}

cleanup() {
    log "Cleaning up..."
    
    # 古いイメージ削除
    docker image prune -f >/dev/null 2>&1 || true
    
    # 古いバックアップ削除（30日以上）
    find "$BACKUP_DIR" -type d -name "backup-*" -mtime +30 -exec rm -rf {} + 2>/dev/null || true
    
    log "Cleanup completed"
}

# スクリプト実行
main "$@"
```

#### **ローリングアップデート**
```bash
#!/bin/bash
# rolling-update.sh - ゼロダウンタイム更新

set -euo pipefail

BLUE_CONTAINER="office-layout-blue"
GREEN_CONTAINER="office-layout-green"
NGINX_CONFIG="/etc/nginx/conf.d/office-layout.conf"

# 現在のアクティブコンテナ特定
get_active_container() {
    if docker ps -q -f name="$BLUE_CONTAINER" | grep -q .; then
        echo "blue"
    elif docker ps -q -f name="$GREEN_CONTAINER" | grep -q .; then
        echo "green"
    else
        echo "none"
    fi
}

# 次のコンテナ名取得
get_next_container() {
    local active=$1
    if [ "$active" = "blue" ]; then
        echo "$GREEN_CONTAINER"
    else
        echo "$BLUE_CONTAINER"
    fi
}

# メイン処理
main() {
    local active_container=$(get_active_container)
    local next_container=$(get_next_container "$active_container")
    
    echo "Active container: $active_container"
    echo "Deploying to: $next_container"
    
    # 新コンテナ起動
    docker run -d \
        --name "$next_container" \
        -p 9001:9000 \
        -v /opt/office-layout-app/data:/usr/src/app/data \
        -e NODE_ENV=production \
        office-layout-app:latest
    
    # ヘルスチェック
    wait_for_health "http://localhost:9001/health"
    
    # Nginxアップストリーム切り替え
    update_nginx_upstream "localhost:9001"
    
    # 古いコンテナ停止
    if [ "$active_container" != "none" ]; then
        docker stop "$active_container"
        docker rm "$active_container"
    fi
    
    echo "Rolling update completed"
}

wait_for_health() {
    local url=$1
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -f "$url" >/dev/null 2>&1; then
            echo "Health check passed"
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 2
    done
    
    echo "Health check failed"
    exit 1
}

update_nginx_upstream() {
    local upstream=$1
    
    # Nginx設定更新
    sed -i "s/server .*/server $upstream;/" "$NGINX_CONFIG"
    
    # Nginx設定リロード
    nginx -s reload
}

main "$@"
```

## 監視・ログ管理

### アプリケーション監視

#### **ヘルスチェックエンドポイント**
```javascript
// server.js内のヘルスチェック実装
app.get('/health', async (req, res) => {
    const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        uptime: process.uptime(),
        checks: {}
    };
    
    try {
        // データファイルアクセスチェック
        health.checks.dataAccess = await checkDataAccess();
        
        // メモリ使用量チェック
        health.checks.memory = checkMemoryUsage();
        
        // ディスク容量チェック
        health.checks.disk = await checkDiskSpace();
        
        const allHealthy = Object.values(health.checks).every(check => check.status === 'healthy');
        
        if (allHealthy) {
            res.status(200).json(health);
        } else {
            health.status = 'unhealthy';
            res.status(503).json(health);
        }
        
    } catch (error) {
        health.status = 'error';
        health.error = error.message;
        res.status(500).json(health);
    }
});

async function checkDataAccess() {
    try {
        const dataExists = await fs.pathExists(INITIAL_DATA_PATH);
        return {
            status: dataExists ? 'healthy' : 'warning',
            message: dataExists ? 'Data files accessible' : 'Data files missing'
        };
    } catch (error) {
        return {
            status: 'error',
            message: error.message
        };
    }
}

function checkMemoryUsage() {
    const usage = process.memoryUsage();
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
    
    return {
        status: heapUsedMB < 256 ? 'healthy' : 'warning',
        heapUsed: `${heapUsedMB}MB`,
        heapTotal: `${heapTotalMB}MB`,
        message: `Memory usage: ${heapUsedMB}/${heapTotalMB}MB`
    };
}

async function checkDiskSpace() {
    try {
        const stats = await fs.stat(DATA_DIR);
        // 簡易ディスク容量チェック（実装は環境依存）
        return {
            status: 'healthy',
            message: 'Disk space sufficient'
        };
    } catch (error) {
        return {
            status: 'error',
            message: error.message
        };
    }
}
```

#### **構造化ログ実装**
```javascript
// logger.js - 構造化ログシステム
class Logger {
    constructor() {
        this.logLevel = process.env.LOG_LEVEL || 'info';
        this.logLevels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3
        };
    }
    
    log(level, message, meta = {}) {
        if (this.logLevels[level] <= this.logLevels[this.logLevel]) {
            const logEntry = {
                timestamp: new Date().toISOString(),
                level: level,
                message: message,
                pid: process.pid,
                ...meta
            };
            
            console.log(JSON.stringify(logEntry));
        }
    }
    
    error(message, error = null, meta = {}) {
        this.log('error', message, {
            error: error ? {
                name: error.name,
                message: error.message,
                stack: error.stack
            } : null,
            ...meta
        });
    }
    
    warn(message, meta = {}) {
        this.log('warn', message, meta);
    }
    
    info(message, meta = {}) {
        this.log('info', message, meta);
    }
    
    debug(message, meta = {}) {
        this.log('debug', message, meta);
    }
    
    // リクエストログ
    logRequest(req, res, responseTime) {
        this.info('HTTP Request', {
            method: req.method,
            url: req.url,
            userAgent: req.get('User-Agent'),
            ip: req.ip,
            statusCode: res.statusCode,
            responseTime: `${responseTime}ms`
        });
    }
    
    // データ操作ログ
    logDataOperation(operation, details) {
        this.info('Data Operation', {
            operation: operation,
            timestamp: new Date().toISOString(),
            ...details
        });
    }
}

const logger = new Logger();
module.exports = logger;
```

### Nginx 設定

#### **リバースプロキシ設定**
```nginx
# nginx.conf
events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;
    
    # ログ形式定義
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for" '
                    'rt=$request_time uct="$upstream_connect_time" '
                    'uht="$upstream_header_time" urt="$upstream_response_time"';
    
    access_log /var/log/nginx/access.log main;
    error_log /var/log/nginx/error.log warn;
    
    # アップストリーム定義
    upstream office_layout_backend {
        server office-layout-app:9000 max_fails=3 fail_timeout=30s;
        keepalive 32;
    }
    
    # HTTPリダイレクト
    server {
        listen 80;
        server_name yourdomain.com;
        return 301 https://$server_name$request_uri;
    }
    
    # HTTPS設定
    server {
        listen 443 ssl http2;
        server_name yourdomain.com;
        
        # SSL設定
        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
        ssl_prefer_server_ciphers off;
        
        # セキュリティヘッダー
        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;
        add_header X-XSS-Protection "1; mode=block";
        add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";
        
        # プロキシ設定
        location / {
            proxy_pass http://office_layout_backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
            
            # タイムアウト設定
            proxy_connect_timeout 30s;
            proxy_send_timeout 30s;
            proxy_read_timeout 30s;
        }
        
        # 静的ファイルキャッシュ
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            proxy_pass http://office_layout_backend;
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
        
        # ヘルスチェック
        location /health {
            proxy_pass http://office_layout_backend;
            access_log off;
        }
    }
}
```

## バックアップ・復旧

### 自動バックアップシステム

#### **cron設定**
```bash
# /etc/cron.d/office-layout-backup
# 毎日深夜2時にバックアップ実行
0 2 * * * root /opt/office-layout-app/scripts/backup.sh >> /var/log/office-layout-backup.log 2>&1

# 毎週日曜深夜にクリーンアップ
0 3 * * 0 root /opt/office-layout-app/scripts/cleanup.sh >> /var/log/office-layout-cleanup.log 2>&1
```

#### **バックアップスクリプト**
```bash
#!/bin/bash
# backup.sh - 定期バックアップスクリプト

set -euo pipefail

# 設定
DATA_DIR="/opt/office-layout-app/data"
BACKUP_BASE="/opt/office-layout-app/backup"
S3_BUCKET="s3://your-backup-bucket/office-layout"
RETENTION_DAYS=30

# 日付ベースディレクトリ
BACKUP_DATE=$(date '+%Y-%m-%d')
BACKUP_DIR="$BACKUP_BASE/$BACKUP_DATE"

# ログ関数
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

main() {
    log "Starting backup process..."
    
    # バックアップディレクトリ作成
    mkdir -p "$BACKUP_DIR"
    
    # データファイルバックアップ
    backup_data_files
    
    # コンテナ状態バックアップ
    backup_container_state
    
    # クラウドストレージ同期（オプション）
    sync_to_cloud
    
    # 古いバックアップ削除
    cleanup_old_backups
    
    log "Backup process completed successfully"
}

backup_data_files() {
    log "Backing up data files..."
    
    # JSONファイルバックアップ
    if [ -f "$DATA_DIR/initial_data.json" ]; then
        cp "$DATA_DIR/initial_data.json" "$BACKUP_DIR/"
        log "Backed up initial_data.json"
    fi
    
    if [ -f "$DATA_DIR/layout_data.json" ]; then
        cp "$DATA_DIR/layout_data.json" "$BACKUP_DIR/"
        log "Backed up layout_data.json"
    fi
    
    # 内部バックアップディレクトリも保存
    if [ -d "$DATA_DIR/backup" ]; then
        cp -r "$DATA_DIR/backup" "$BACKUP_DIR/internal_backup"
        log "Backed up internal backup directory"
    fi
    
    # チェックサム作成
    cd "$BACKUP_DIR"
    find . -type f -exec sha256sum {} \; > checksums.sha256
    log "Created checksums"
}

backup_container_state() {
    log "Backing up container state..."
    
    # コンテナ情報保存
    docker inspect office-layout-prod > "$BACKUP_DIR/container-info.json" 2>/dev/null || true
    
    # イメージ情報保存
    docker images office-layout-app --format "table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.CreatedAt}}\t{{.Size}}" > "$BACKUP_DIR/image-info.txt" 2>/dev/null || true
    
    log "Container state backed up"
}

sync_to_cloud() {
    if command -v aws >/dev/null 2>&1 && [ -n "${S3_BUCKET:-}" ]; then
        log "Syncing to cloud storage..."
        
        # S3同期
        aws s3 sync "$BACKUP_DIR" "$S3_BUCKET/$BACKUP_DATE" --delete
        
        log "Cloud sync completed"
    else
        log "Cloud sync skipped (AWS CLI not available or S3_BUCKET not set)"
    fi
}

cleanup_old_backups() {
    log "Cleaning up old backups..."
    
    # ローカルバックアップクリーンアップ
    find "$BACKUP_BASE" -type d -name "20*-*-*" -mtime +$RETENTION_DAYS -exec rm -rf {} + 2>/dev/null || true
    
    # クラウドストレージクリーンアップ（S3ライフサイクルポリシー推奨）
    if command -v aws >/dev/null 2>&1 && [ -n "${S3_BUCKET:-}" ]; then
        local cutoff_date=$(date -d "$RETENTION_DAYS days ago" '+%Y-%m-%d')
        aws s3 ls "$S3_BUCKET/" | awk '$1 < "'$cutoff_date'" {print $2}' | while read -r old_backup; do
            aws s3 rm "$S3_BUCKET/$old_backup" --recursive
        done 2>/dev/null || true
    fi
    
    log "Cleanup completed"
}

main "$@"
```

#### **復旧スクリプト**
```bash
#!/bin/bash
# restore.sh - データ復旧スクリプト

set -euo pipefail

# 引数チェック
if [ $# -lt 1 ]; then
    echo "Usage: $0 <backup-date> [--confirm]"
    echo "Example: $0 2025-01-13 --confirm"
    exit 1
fi

BACKUP_DATE=$1
CONFIRM=${2:-""}
DATA_DIR="/opt/office-layout-app/data"
BACKUP_DIR="/opt/office-layout-app/backup/$BACKUP_DATE"

# 確認フラグチェック
if [ "$CONFIRM" != "--confirm" ]; then
    echo "This will restore data from backup: $BACKUP_DATE"
    echo "Current data will be backed up to: $DATA_DIR/restore-backup-$(date '+%Y%m%d-%H%M%S')"
    echo "To proceed, run: $0 $BACKUP_DATE --confirm"
    exit 0
fi

main() {
    echo "Starting restore process from: $BACKUP_DATE"
    
    # バックアップ存在確認
    check_backup_exists
    
    # チェックサム検証
    verify_backup_integrity
    
    # 現在データの安全バックアップ
    backup_current_data
    
    # アプリケーション停止
    stop_application
    
    # データ復元
    restore_data
    
    # アプリケーション開始
    start_application
    
    # 復元確認
    verify_restoration
    
    echo "Restore process completed successfully"
}

check_backup_exists() {
    if [ ! -d "$BACKUP_DIR" ]; then
        echo "ERROR: Backup directory not found: $BACKUP_DIR"
        exit 1
    fi
    
    if [ ! -f "$BACKUP_DIR/initial_data.json" ] && [ ! -f "$BACKUP_DIR/layout_data.json" ]; then
        echo "ERROR: No data files found in backup directory"
        exit 1
    fi
    
    echo "Backup directory verified: $BACKUP_DIR"
}

verify_backup_integrity() {
    if [ -f "$BACKUP_DIR/checksums.sha256" ]; then
        echo "Verifying backup integrity..."
        cd "$BACKUP_DIR"
        if sha256sum -c checksums.sha256 --quiet; then
            echo "Backup integrity verified"
        else
            echo "ERROR: Backup integrity check failed"
            exit 1
        fi
    else
        echo "WARNING: No checksum file found, skipping integrity check"
    fi
}

backup_current_data() {
    local current_backup_dir="$DATA_DIR/restore-backup-$(date '+%Y%m%d-%H%M%S')"
    mkdir -p "$current_backup_dir"
    
    echo "Backing up current data to: $current_backup_dir"
    
    if [ -f "$DATA_DIR/initial_data.json" ]; then
        cp "$DATA_DIR/initial_data.json" "$current_backup_dir/"
    fi
    
    if [ -f "$DATA_DIR/layout_data.json" ]; then
        cp "$DATA_DIR/layout_data.json" "$current_backup_dir/"
    fi
    
    echo "Current data backed up"
}

stop_application() {
    echo "Stopping application..."
    docker stop office-layout-prod 2>/dev/null || true
    echo "Application stopped"
}

restore_data() {
    echo "Restoring data files..."
    
    if [ -f "$BACKUP_DIR/initial_data.json" ]; then
        cp "$BACKUP_DIR/initial_data.json" "$DATA_DIR/"
        echo "Restored initial_data.json"
    fi
    
    if [ -f "$BACKUP_DIR/layout_data.json" ]; then
        cp "$BACKUP_DIR/layout_data.json" "$DATA_DIR/"
        echo "Restored layout_data.json"
    fi
    
    # 権限修正
    chown -R 1001:1001 "$DATA_DIR"
    
    echo "Data restoration completed"
}

start_application() {
    echo "Starting application..."
    docker start office-layout-prod
    
    # 起動待機
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -f http://localhost:9000/health >/dev/null 2>&1; then
            echo "Application started successfully"
            return 0
        fi
        
        attempt=$((attempt + 1))
        echo "Waiting for application startup... ($attempt/$max_attempts)"
        sleep 2
    done
    
    echo "ERROR: Application failed to start"
    exit 1
}

verify_restoration() {
    echo "Verifying restoration..."
    
    # データファイル存在確認
    if [ -f "$DATA_DIR/initial_data.json" ] && [ -f "$DATA_DIR/layout_data.json" ]; then
        echo "Data files present"
    else
        echo "ERROR: Data files missing after restoration"
        exit 1
    fi
    
    # アプリケーション動作確認
    if curl -f http://localhost:9000/health >/dev/null 2>&1; then
        echo "Application health check passed"
    else
        echo "ERROR: Application health check failed"
        exit 1
    fi
    
    echo "Restoration verification completed"
}

main "$@"
```

## セキュリティ設定

### ファイアウォール設定

#### **iptables設定**
```bash
#!/bin/bash
# firewall.sh - ファイアウォール設定

# 既存ルール削除
iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X

# デフォルトポリシー設定
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT ACCEPT

# ローカルループバック許可
iptables -A INPUT -i lo -j ACCEPT

# 確立済み接続許可
iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# SSH許可（管理用）
iptables -A INPUT -p tcp --dport 22 -j ACCEPT

# HTTP/HTTPS許可
iptables -A INPUT -p tcp --dport 80 -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -j ACCEPT

# アプリケーションポート（内部のみ）
iptables -A INPUT -s 172.16.0.0/12 -p tcp --dport 9000 -j ACCEPT

# ICMP許可（制限付き）
iptables -A INPUT -p icmp --icmp-type echo-request -j ACCEPT

# 設定保存
iptables-save > /etc/iptables/rules.v4
```

### SSL/TLS設定

#### **証明書管理**
```bash
#!/bin/bash
# ssl-setup.sh - SSL証明書設定

SSL_DIR="/etc/nginx/ssl"
DOMAIN="yourdomain.com"

# Let's Encrypt証明書取得
setup_letsencrypt() {
    # Certbot インストール
    apt-get update
    apt-get install -y certbot python3-certbot-nginx
    
    # 証明書取得
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email admin@"$DOMAIN"
    
    # 自動更新設定
    echo "0 3 * * * root certbot renew --quiet && systemctl reload nginx" >> /etc/crontab
}

# 自己署名証明書作成（開発用）
setup_selfsigned() {
    mkdir -p "$SSL_DIR"
    
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$SSL_DIR/key.pem" \
        -out "$SSL_DIR/cert.pem" \
        -subj "/C=JP/ST=Tokyo/L=Tokyo/O=Company/CN=$DOMAIN"
    
    chmod 600 "$SSL_DIR/key.pem"
    chmod 644 "$SSL_DIR/cert.pem"
}

# 環境に応じて選択
if [ "${ENVIRONMENT:-}" = "production" ]; then
    setup_letsencrypt
else
    setup_selfsigned
fi
```

## 運用メトリクス

### システム監視

#### **監視スクリプト**
```bash
#!/bin/bash
# monitor.sh - システム監視スクリプト

LOG_FILE="/var/log/office-layout-monitor.log"
ALERT_EMAIL="admin@yourdomain.com"
THRESHOLD_CPU=80
THRESHOLD_MEMORY=80
THRESHOLD_DISK=90

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

send_alert() {
    local subject="$1"
    local message="$2"
    
    echo "$message" | mail -s "$subject" "$ALERT_EMAIL" 2>/dev/null || true
    log "ALERT SENT: $subject"
}

check_cpu_usage() {
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}')
    cpu_usage=${cpu_usage%.*}  # 小数点以下切り捨て
    
    if [ "$cpu_usage" -gt "$THRESHOLD_CPU" ]; then
        send_alert "High CPU Usage Alert" "CPU usage is ${cpu_usage}% (threshold: ${THRESHOLD_CPU}%)"
    fi
    
    log "CPU usage: ${cpu_usage}%"
}

check_memory_usage() {
    local memory_usage=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}')
    
    if [ "$memory_usage" -gt "$THRESHOLD_MEMORY" ]; then
        send_alert "High Memory Usage Alert" "Memory usage is ${memory_usage}% (threshold: ${THRESHOLD_MEMORY}%)"
    fi
    
    log "Memory usage: ${memory_usage}%"
}

check_disk_usage() {
    local disk_usage=$(df /opt/office-layout-app | tail -1 | awk '{print $5}' | sed 's/%//')
    
    if [ "$disk_usage" -gt "$THRESHOLD_DISK" ]; then
        send_alert "High Disk Usage Alert" "Disk usage is ${disk_usage}% (threshold: ${THRESHOLD_DISK}%)"
    fi
    
    log "Disk usage: ${disk_usage}%"
}

check_container_health() {
    if ! docker ps | grep -q office-layout-prod; then
        send_alert "Container Down Alert" "Office Layout container is not running"
        log "ERROR: Container is not running"
        return 1
    fi
    
    if ! curl -f http://localhost:9000/health >/dev/null 2>&1; then
        send_alert "Health Check Failed" "Application health check failed"
        log "ERROR: Health check failed"
        return 1
    fi
    
    log "Container health: OK"
}

main() {
    log "Starting system monitoring..."
    
    check_cpu_usage
    check_memory_usage
    check_disk_usage
    check_container_health
    
    log "Monitoring cycle completed"
}

main "$@"
```

#### **cron設定（監視）**
```bash
# /etc/cron.d/office-layout-monitor
# 5分ごとに監視実行
*/5 * * * * root /opt/office-layout-app/scripts/monitor.sh

# 1時間ごとにログローテーション
0 * * * * root /usr/sbin/logrotate /etc/logrotate.d/office-layout
```

---

この運用・デプロイメント要件は、**安定性・保守性・運用効率**を重視し、中小規模のシステム運用に最適化された実用的な設計となっています。