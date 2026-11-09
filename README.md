# my-super-agent

## 启动虚拟 IM

本机部署使用 WSL Debian，启动前需要已配置 `superagent-virtual-im` 配置文件并构建 DSH bundle。首次部署请参考 [SETUP.zh-CN.md](dsh-superagent-prototype/SETUP.zh-CN.md) 和[虚拟 IM 配置](dsh-superagent-prototype/docs/006-deployment.md#virtual-im)。

电脑重启或服务停止后，在 Windows PowerShell 中运行以下命令。路径对应本机的安装位置。

```powershell
wsl -d Debian --cd /home/plankton/.local/share/superagent-virtual-im/bundle --exec env PATH=/home/plankton/.local/share/superagent-virtual-im/node/bin:/home/plankton/.local/share/superagent-virtual-im/tools/bin:/usr/bin:/bin scripts/dsh-superagent --profile superagent-virtual-im start
```

等终端显示 `"runtime": "ready"` 后，打开[虚拟 IM](http://127.0.0.1:3082/virtual-im)。可以直接私聊 SuperAgent，也可以在项目群里用 `@SuperAgent` 派活。服务已经运行时，直接打开页面即可。

## 启动实时观测 Dashboard

SuperAgent 就绪后，在另一个 Windows PowerShell 窗口运行：

```powershell
wsl -d Debian --exec /home/plankton/.local/share/superagent-virtual-im/node/bin/node /mnt/c/Projects/Agent/my-super-agent/dsh-superagent-prototype/scripts/observatory-preview/server.mjs
```

保持该窗口打开，访问[实时观测 Dashboard](http://127.0.0.1:3083/)。Dashboard 从本机 `3082` 的 SuperAgent 读取状态。点击节点或连线可以查看详情，点击「近期完成」可以查看历史工单、PR 和跟进消息。
