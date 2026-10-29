# Vercelへの公開

初めての場合は [画面ごとの作成・接続手順](launch-guide.md) を使用してください。

1. このリポジトリを自分のGitHubへ保存します。環境変数、実データ、バックアップJSONが含まれていないことを確認してください。
2. VercelでリポジトリをImportし、Framework PresetをNext.js、Node.jsを24に設定します。Root Directoryはリポジトリルートです。
3. Install Commandは `npm ci`、Build Commandは `npm run build` を使います。
4. ローカルモードだけなら環境変数は不要です。クラウド利用時はSupabaseの新規プロジェクトにsupabase/schema.sqlを適用後、`NEXT_PUBLIC_SUPABASE_URL` と公開用 `NEXT_PUBLIC_SUPABASE_ANON_KEY` をVercelのEnvironment Variablesに設定します。
5. Vercelの公開URLをSupabase AuthenticationのSite URLとRedirect URLsに登録します。プレビューURLも使う場合は、許可するプレビューの範囲を明示してください。
6. Deploy後にHTTPSでアクセスし、メールログイン、チーム作成、別アカウントの閲覧制限、別端末からの読み込み、オフライン再接続を検証します。
7. PWAのインストールと、通信切断後の再読み込み・記録を確認します。

この開発作業では実SupabaseやVercelへの公開は行っていません。公開前に本番プロジェクトのRLS、メール配信、レート制限、バックアップ保持と個人情報の扱いをチームの運用に合わせて設定してください。PUBLIC環境変数を変更したときは再ビルドが必要です。

## 端末の再利用

クラウド開発タスクは独立した環境です。既存の `/workspace/basketball-stats-app` を使用し、依頼がない限りworktreeを作成する必要はありません。依存関係を復元したら `npm run dev` で開発します。保存されたファイルや依存関係とは異なり、サーバープロセスは再起動が必要です。
