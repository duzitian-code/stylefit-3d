# StyleFit AI Digital Human Roadmap

StyleFit 的目标不是照片贴脸或普通 image-to-3D，而是电商可用的 AI 数字人：用户上传照片后，服务端生成可旋转、可试穿、可绑定姿态的数字人资产。

## 生产目标

- 身份一致：脸型、五官比例、肤色和可见发型应接近用户照片。
- 身材一致：身高、体重、肩宽、腰臀比例和腿长应满足试穿尺码误差要求。
- 服装可用：输出的身体 mesh、rig 和服装锚点能支持后续 garment try-on。
- 移动端可渲染：导出 GLB/USDZ、PBR 材质、LOD 和压缩纹理。
- 商用合规：训练数据、人体先验、脸部先验、权重和 runner 都必须自有或授权可商用。

## 自研模型包

生产 worker 只读取本地 `workers/stylefit_avatar/models/manifest.json`。示例见 `workers/stylefit_avatar/model_manifest.example.json`。

模型包必须包含这些 stage：

1. `imageQuality`：图片质量、真人检测、授权/安全门控。
2. `portraitMatting`：人体、人脸、头发、手部、可见服装解析。
3. `bodyLandmarks`：2D keypoints、dense pose、相机参数。
4. `bodyShapeFit`：SMPL-X 兼容身体参数拟合。
5. `faceIdentity`：身份特征编码、脸部几何和表情拟合。
6. `hairReconstruction`：发型体积或 hair cards 重建。
7. `garmentAndMaterial`：可见服装层、轮廓和材质估计。
8. `neuralTextureBake`：脸、皮肤、头发、服装材质贴图烘焙。
9. `rigAndRetarget`：移动端可控 rig 和姿态重定向。
10. `assetExport`：GLB/USDZ、纹理压缩、LOD 和 metadata 导出。

## 质量门槛

`manifest.json` 中的 `qualityGates` 至少应包含：

- `minIdentitySimilarity`：脸部身份相似度阈值。
- `maxBodyMeasurementErrorCm`：身体测量误差阈值。
- `minTextureResolution`：贴图最低分辨率。
- `requiresNoWatermark`：禁止带第三方水印输出。
- `requiresCommercialConsent`：数据和权重必须可用于商业虚拟试穿。

## 当前代码状态

- `workers/stylefit_avatar/digital_human.py` 已实现生产模型包 readiness 校验和 manifest runner 编排。
- `workers/stylefit_avatar/parametric_avatar.py` 已实现自托管参数化数字人 MVP，输出 `stylefit-parametric-digital-human`，用于替代粗糙开发基线进行产品预览。
- `workers/stylefit_avatar/parametric_bundle.py` 提供本地 preview bundle 入口：可以把自有或商用授权的高质量 GLB mannequin 放进 `workers/stylefit_avatar/models/parametric_manifest.json`，无需改 App 或 API。
- `workers/stylefit_avatar/pipeline.py` 默认要求生产数字人模型包齐全，缺少任何 runner/weights/config 都不会返回 `avatarModelUri`。
- `STYLEFIT_AVATAR_ENABLE_DEV_BASELINE=1` 只打开自研开发基线 GLB，用来验证上传、轮询、GLB 托管和前端渲染，不代表数字人质量。
- 开源/自托管选型见 `docs/OPEN_SOURCE_DIGITAL_HUMAN_STACK.md`。

## 低成本升级口

参数化 MVP 的短期质量提升路线不是继续伪造照片级身份，而是替换基础资产：

1. 先保留当前 procedural mannequin 作为离线兜底。
2. 用 Blender 或商用授权资产制作 female/male/neutral/default GLB mannequin。
3. 通过 `workers/stylefit_avatar/parametric_manifest.example.json` 配置本地 preview bundle。
4. 在 worker health 中确认 `parametricBundle.ready=true` 后，参数化 MVP 会优先返回本地高质量 GLB。
5. 等身份/body/texture 模型训练完成，再切到生产 `models/manifest.json`。

## 研发顺序

1. 先做数据闭环：拍摄规范、用户授权、训练集/验证集、身份和身材评测脚本。
2. 做 body-first MVP：人体解析、关键点、SMPL-X 拟合、无脸部细节的可控 body rig。
3. 加 identity head：脸部身份编码、头部 mesh、表情和纹理烘焙。
4. 加 hair 和 garment parsing：把发型和衣服从贴图提升到可控几何/材质层。
5. 做 try-on contract：服装 mesh、材质、碰撞/锚点和组合导出。
6. 做移动端资产优化：GLB/USDZ、LOD、纹理压缩、缓存和删除机制。

## 明确不做

- 不把用户照片贴到低模头上冒充数字人。
- 不调用付费第三方 API 作为核心后台能力。
- 不把研究用途、非商用或授权不明的权重放进 App Store 生产链路。