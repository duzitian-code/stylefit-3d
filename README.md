# StyleFit 3D

智能 3D 穿搭 App 原型，使用 Expo + React Native + TypeScript 开发，目标同时支持 iOS 和 Android。

## 已实现

- 本人照片上传入口和身高、体重、版型偏好配置。
- 内置衣橱单品和商品推荐演示数据，开发环境可直接预览推荐流程。
- WebGL 3D viewer，可加载本地演示 GLB 和后端返回的 avatar/garment 重建模型。
- 衣服照片上传入口和 3D 衣橱列表。
- 天气、气温、场景驱动的穿搭推荐。
- 基于个人数据、预算和衣橱缺口的商品推荐。
- 产品需求文档和后续服务架构说明。

## 运行

```bash
npm install
npm start
```

然后在 Expo Dev Tools 中选择 iOS Simulator、Android Emulator，或用 Expo Go 扫码预览。

Web 预览可以使用：

```bash
npm run web
```

## 真人 3D 重建接入

前端不会在本地伪造真人 mesh。上传照片后会调用 `EXPO_PUBLIC_RECONSTRUCTION_API_URL` 的 `/avatar/reconstruct`，只有返回 `avatarModelUri` 时才渲染真人模型。

本地 Reconstruction API 默认转发到自研 StyleFit Avatar worker：

```bash
cp .env.example .env
npm run reconstruction:api
```

默认自研配置：

```bash
AVATAR_RECONSTRUCTION_PROVIDER=stylefit
STYLEFIT_AVATAR_WORKER_URL=http://localhost:8791
```

StyleFit Avatar worker 是本项目的自研重建服务边界，启动方式见 [workers/stylefit_avatar/README.md](workers/stylefit_avatar/README.md)。它不会在模型包缺失时输出假 GLB。

低成本产品预览可以使用参数化 MVP：

```bash
npm run reconstruction:worker:stylefit:parametric
```

该模式返回 `provenance: "stylefit-parametric-digital-human"`。默认使用自研 procedural mannequin，也可以通过 `workers/stylefit_avatar/parametric_manifest.example.json` 接入自有或商用授权的本地 GLB mannequin bundle；这仍然不是照片级身份复刻。

可以先生成一个可运行的本地 Preview Bundle：

```bash
npm run reconstruction:bundle:bootstrap
```

之后再把 `workers/stylefit_avatar/models/mannequins/` 下的 GLB 替换为更高质量的自有或商用授权资产。

自研数字人路线见 [docs/DIGITAL_HUMAN_ROADMAP.md](docs/DIGITAL_HUMAN_ROADMAP.md)。生产目标是电商级 AI 数字人：身份一致、身材可量化、可绑定 rig、可输出移动端 GLB/USDZ，并且所有模型和数据都满足商业授权。

自托管部署方式见 [docs/SELF_HOSTED_DEPLOYMENT.md](docs/SELF_HOSTED_DEPLOYMENT.md)。

开发阶段可以显式开启自研基线 GLB 导出器，用来验证上传、任务轮询、GLB 托管和 Three.js 渲染链路：

```bash
STYLEFIT_AVATAR_ENABLE_DEV_BASELINE=1 npm run reconstruction:worker:stylefit
```

该模式返回的模型会带有 `provenance: "stylefit-dev-baseline"`，前端会标注为“自研基线 3D 模型”，不能作为 AI 数字人、身份级真人重建或 App Store 生产能力宣传。

TripoSR 是 MIT 许可证的开源单图 3D 重建模型，可以作为实验性备选 worker，启动方式见 [workers/triposr/README.md](workers/triposr/README.md)。它不是人体身份级 avatar 重建系统。

也可以把 `.env` 里的 `AVATAR_RECONSTRUCTION_PROVIDER_URL` 指向其他自研或自托管的人体 3D 重建服务。该服务应返回：

```json
{
  "status": "ready",
  "avatarModelUri": "https://cdn.example.com/avatars/user.glb",
  "faceTextureUri": "https://cdn.example.com/avatars/user-face.png",
  "rig": "smplx"
}
```

如果 provider 返回 `queued` 或 `processing`，可以附带 `jobId` 或 `pollUrl`，前端会轮询直到 `ready`、`failed` 或超时。

## 代码结构

- `App.tsx`：主应用界面和端侧交互。
- `src/components/`：试穿预览、衣橱卡片、商品卡片等组件。
- `src/data/mockData.ts`：初始衣橱、天气和商品数据。
- `src/logic/reconstruction.ts`：照片到 3D 模型的重建输入/输出契约。
- `src/logic/recommendations.ts`：穿搭和商品推荐逻辑。
- `docs/PRODUCT_REQUIREMENTS.md`：功能和需求设计。
- `docs/ARCHITECTURE.md`：技术架构和后续真实 3D 服务规划。

## 3D 模型说明

当前内置的 3D 预览资产来自 `workers/stylefit_avatar/models/mannequins/`，由项目里的参数化 mannequin 生成器自生成，用来验证 GLB 加载、灯光、相机、性别/版型切换和渲染链路。它不是用户照片重建结果，也不会被标记为真人身份模型。

上传真人照片后，前端会进入生成状态并等待 API 返回 `avatarModelUri`。只有生产级 StyleFit 数字人 provider 返回 `provenance: "stylefit-digital-human"` 或同等生产 provenance 时，预览才会显示为“AI 数字人模型”。
