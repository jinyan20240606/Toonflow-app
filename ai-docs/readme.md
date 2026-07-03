# ai-short-drama

## 当前工作方式

- `master`：只跟官方开源项目
- `custom/local-work`：只放我的二开改动
- 平时开发：一直在 `custom/local-work`
- 官方更新：先同步到 `master`，再 rebase 到 `custom/local-work`

## 快速命令

### 一次性更新

```bash
git checkout master
cd waoowaoo && git remote add upstream https://github.com/HBAI-Ltd/Toonflow-app && git fetch upstream

git fetch upstream
git merge upstream/master
git checkout custom/local-work
git rebase master
```

### 推送自己的分支

```bash
git push origin custom/local-work
```
