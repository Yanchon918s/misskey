# ao9s.net Misskey forkのCI/CD

この公開forkは、`misskey.ao9s.net`で実行する改変版Misskeyの対応ソースを公開し、GitHub ActionsとGitOpsでK3sへ反映するためのリポジトリである。起点は上流Misskey `2026.7.0`（`8ea4a0ecac058688f69706ab88de1fcd439e2621`）で、ライセンスは上流と同じAGPL-3.0-onlyである。

## ブランチと権限境界

- `ao9s/production`: 本番へ出すソース。Pull RequestとpushはGitHub-hosted runnerでfull build、上流CI対象のESLint / typecheck / DTS検査を実行する。
- `ao9s/deploy`: GitOps controllerが読む本番Deployment。成功したimage buildだけがimmutable digestを更新する。
- 公開Pull Requestから自宅K3s、GitHub Packages書き込みtoken、本番Secretへは到達させない。
- workflowの通常権限はread-onlyとし、GHCR publishとdeploy branch更新に限ってworkflow内で`packages: write` / `contents: write`を要求する。
- actionはversion tagではなくcommit SHAで固定する。

## 自動反映

1. `ao9s/production`のpushに対して`ao9s CI`がfull build、上流CI対象のESLint / typecheck / DTS検査を行う。
2. 成功した同一repositoryのpushだけを`ao9s Publish and Deploy`が受け取る。
3. GitHub-hosted runnerが`linux/amd64` imageをbuildし、SBOMとprovenanceを付けて`ghcr.io/yanchon918s/misskey`へpushする。
4. build digestとsource revisionを`ao9s/deploy`の`deploy/production/misskey.yaml`へcommitする。
5. K3sのFlux source-controller / kustomize-controllerが公開deploy branchをpollし、namespace `misskey-preview`のDeployment `misskey-preview`だけをserver-side applyする。
6. Kubernetesのstartup/readiness/liveness probeが成功したPodだけをService対象にする。`ao9s/deploy`の現行設定はquotaに合わせて`maxSurge: 0` / `maxUnavailable: 1`となっているため、1 Pod構成では入れ替え時に停止時間がある。

Database migrationが新旧Podで同時利用できない上流更新は、この自動経路へ直接入れない。release note、migration、backup、rollback pointを確認してmaintenance手順で更新する。

## 2026.11.0への更新

上流の安定版タグ `2026.11.0`（`dd7b4905d715d2587fa2f2cb6a88ecac8878ef0d`）に追従する。登録承認、連合のロール制限、バブル・メディアタイムライン、ステータスメッセージは維持する。NIWAは画面・ウィジェット・APIの提供を終了するが、`niwa_garden` と `user_profile.niwaLastWateredAt` は既存データを保持するため残す。保存済みのNIWAウィジェット設定は表示・編集対象から除外する。

- Node.jsは24.22.3以上の24系、または26.13.1以上の26系が必要。DockerfileとCIはリポジトリの26.13.1を使用する。pnpmは12.17.0。
- Dockerfileの新しい起動コマンド `node ./scripts/start.mjs --migrate` を使用する。独自の `command` / `args` や `NODE_OPTIONS` がある場合は、起動位置がリポジトリルートになる点を確認する。
- Sentryを明示設定している場合は、上流2026.10.1のリリースノートに従い、廃止された `sendDefaultPii` / `profilesSampleRate` を確認する。
- 本番反映前にDBのバックアップと直前の正常image digestを確保する。追加migrationは、お知らせの自動アーカイブ日時、フォロー承認までの秒数、パスワード列のコメント、metaの既定値を扱う4件。既存migrationは変更しない。
- 更新を戻す場合、旧imageではNIWAも再び有効になる。追加列の削除は新しい設定値を失うため、DBの `down` を機械的に実行しない。特にmetaの既定値を戻すmigrationは設定ファイルを参照するため、旧forkの既定値と一致するかを確認する。

上流のメモリ削減と不要なデータ取得の修正を含むが、本番での改善幅は未測定。反映前後の同程度の負荷で、Podのメモリ使用量、タイムラインAPIの応答時間、PostgreSQLの遅いクエリ、配送キューの滞留を比較して次の改善対象を決める。

## AGPLの公開導線

稼働instanceの管理設定にあるrepository URLを`https://github.com/Yanchon918s/misskey`へ設定する。これによりAbout画面とNodeInfoから、実際に配備した改変版の対応ソースへ到達できる。build手順はDockerfileとGitHub Actions、本番manifestは`deploy/production`に含める。Secret、token、private key、database dump、instance設定値は公開repositoryへ置かない。

## Rollback

自動反映後に問題がある場合は、`ao9s/deploy`のmanifestを直前の正常image digestへ戻す。緊急の手動patchを行う場合は、先にFluxの`misskey-production` Kustomizationをsuspendしないと次回reconcileで宣言状態へ戻る。database schemaが後方互換でない場合はimageだけを戻さず、backupとmigrationの復旧手順を優先する。
