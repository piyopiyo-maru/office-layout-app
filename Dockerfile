# ベースイメージとして Node.js を使用
FROM node:18-alpine AS builder

# アプリケーションの作業ディレクトリを設定
WORKDIR /usr/src/app

# package.json と package-lock.json (または yarn.lock) をコピー
COPY package*.json ./

# 依存関係をインストール
RUN npm install

# アプリケーションのソースコードをコピー
COPY . .

# ポートを開放 (Expressサーバーがリッスンするポート)
EXPOSE 3000

# アプリケーションを起動するコマンド
CMD [ "node", "server.js" ]

# 本番用イメージのためのマルチステージビルド (任意だが推奨)
# FROM node:18-alpine
# WORKDIR /usr/src/app
# COPY package*.json ./
# RUN npm install --only=production
# COPY --from=builder /usr/src/app/public ./public
# COPY --from=builder /usr/src/app/data ./data
# COPY --from=builder /usr/src/app/server.js ./server.js
# EXPOSE 3000
# CMD [ "node", "server.js" ]
