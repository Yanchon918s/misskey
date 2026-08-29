# ao9s.net Misskey forkのCI/CD

この公開forkは、`misskey.ao9s.net`で実行する改変版Misskeyの対応ソースを公開し、GitHub ActionsとGitOpsでK3sへ反映するためのリポジトリである。起点は上流Misskey `2026.7.0`（`8ea4a0ecac058688f69706ab88de1fcd439e2621`）で、ライセンスは上流と同じAGPL-3.0-onlyである。

機能開発から本番反映までのブランチ運用は、[AO9S_BRANCH_STRATEGY.md](./AO9S_BRANCH_STRATEGY.md)に定める。

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
6. Kubernetesのstartup/readiness/liveness probeと`maxUnavailable: 0`のRollingUpdateが成功したPodだけをService対象にする。

Database migrationが新旧Podで同時利用できない上流更新は、この自動経路へ直接入れない。release note、migration、backup、rollback pointを確認してmaintenance手順で更新する。

## AGPLの公開導線

稼働instanceの管理設定にあるrepository URLを`https://github.com/Yanchon918s/misskey`へ設定する。これによりAbout画面とNodeInfoから、実際に配備した改変版の対応ソースへ到達できる。build手順はDockerfileとGitHub Actions、本番manifestは`deploy/production`に含める。Secret、token、private key、database dump、instance設定値は公開repositoryへ置かない。

## Rollback

自動反映後に問題がある場合は、`ao9s/deploy`のmanifestを直前の正常image digestへ戻す。緊急の手動patchを行う場合は、先にFluxの`misskey-production` Kustomizationをsuspendしないと次回reconcileで宣言状態へ戻る。database schemaが後方互換でない場合はimageだけを戻さず、backupとmigrationの復旧手順を優先する。
