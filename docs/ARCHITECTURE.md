# StyleFit 3D 技术架构

## 当前工程

- 移动端：Expo SDK 56、React Native、TypeScript。
- 入口文件：`App.tsx`。
- 数据模型：`src/types.ts`。
- Mock 数据：`src/data/mockData.ts`。
- 推荐逻辑：`src/logic/recommendations.ts`。
- UI 组件：`src/components/`。

## 第一版端侧能力

- `expo-image-picker` 负责本人照片和衣服照片上传。
- 本地状态保存个人数据、天气样例、衣橱单品和当前场景。
- 推荐算法在端侧运行，按天气、体感、场景、颜色偏好、预算和衣橱缺口打分。
- 3D 试穿预览使用 WebGL/Three.js viewer。当前本地保留一份演示人体 GLB，只用于验证模型加载、相机、灯光和渲染链路；默认预览不会展示该资产，生产环境必须加载服务端返回的 glTF/GLB avatar、face texture、garment mesh 和材质。

## 生产级 3D 服务建议

1. Avatar Service：处理用户照片，做人像分割、身体关键点检测、SMPL/SMPL-X 参数拟合和纹理生成。
2. Garment Service：处理衣服照片，做前景分割、品类识别、材质估计、2D 到 3D 服装网格重建。
3. Try-On Service：根据人体模型、服装模型、尺码和材质参数生成穿着后的网格或渲染图。
4. Recommendation Service：融合天气、个人偏好、衣橱、历史点击和商品库进行排序。
5. Commerce Adapter：对接淘宝、京东、品牌官网、Shopify 或联盟平台，标准化商品、价格、库存和尺码表。

## 当前 Avatar 重建 API 接入

- 前端上传真人照片后调用 `EXPO_PUBLIC_RECONSTRUCTION_API_URL/avatar/reconstruct`。
- 本地 `server/reconstruction-api.mjs` 默认使用 `stylefit` provider，转发到自研 StyleFit Avatar worker；它不会在本地伪造真人模型。
- StyleFit Avatar worker 位于 `workers/stylefit_avatar`，定义自研 AI 数字人 pipeline、模型包清单、生产授权检查和 GLB/USDZ 输出边界。
- 自研数字人路线见 `docs/DIGITAL_HUMAN_ROADMAP.md`；目标是电商级数字人，不是普通照片贴图或低模 avatar。
- `STYLEFIT_AVATAR_ENABLE_DEV_BASELINE=1` 会启用仓库内自研的参数化 GLB 导出器，只用于验证端到端工程链路。该输出会带 `provenance: "stylefit-dev-baseline"`，前端必须标注为非身份级真人重建。
- TripoSR worker 位于 `workers/triposr`，使用 MIT 许可证的 `VAST-AI-Research/TripoSR`，作为实验性开源单图 3D 重建备选，不作为人体身份级 avatar 主路线。
- 代理也可以通过 `AVATAR_RECONSTRUCTION_PROVIDER_URL` 转发 multipart 请求到其他自研或自托管 Avatar provider。
- provider 必须返回 `avatarModelUri`，前端才会渲染 3D 模型。
- provider 应返回 `provenance`，用于区分 `stylefit-digital-human`、`stylefit-production`、`stylefit-dev-baseline` 和演示资产，避免把开发基线或样例模型标成 AI 数字人。
- provider 可返回 `queued` / `processing` + `jobId` 或 `pollUrl`，前端会短轮询等待 `ready`。

## 数据边界

- 端侧只保存必要的展示状态和低敏偏好。
- 照片、人体模型、服装模型需要服务端加密存储，并提供用户主动删除入口。
- 训练或优化模型前必须获得单独授权，不应默认把用户照片用于训练。

## 可替换模块

- 天气：从 mock 数据替换为高德、OpenWeather、Apple WeatherKit 或自建天气接口。
- 商品：从 mock 商品库替换为聚合商品搜索服务。
- 3D：当前 `AvatarPreview` 已通过 `expo-gl` + Three.js 加载 GLB；后续重点是接入服务端生成的 glTF/USDZ 模型和服装网格。

## 真实 3D 建模边界

- 用户照片不是直接贴到模型上；照片只作为 Avatar Service 的输入。
- Avatar Service 输出 `avatarModelUri`、`faceTextureUri`、身体测量值和 rig 信息。
- Garment Service 输出 `garmentModelUri`、`garmentTextureUri`、材质和尺码估计。
- Try-On Service 输出组合后的 `combinedModelUri`，前端 viewer 只负责加载、旋转、缩放和展示。

## 本地运行

```bash
npm start
npm run android
npm run ios
```

本地 Web 预览加自研开发基线 worker：

```bash
npm run web
STYLEFIT_AVATAR_ENABLE_DEV_BASELINE=1 npm run reconstruction:worker:stylefit
PORT=8787 AVATAR_RECONSTRUCTION_PROVIDER=stylefit STYLEFIT_AVATAR_WORKER_URL=http://localhost:8791 npm run reconstruction:api
```
