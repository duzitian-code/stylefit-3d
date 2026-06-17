# Garment Asset Pipeline

StyleFit 0.4 starts treating clothing as renderable 3D assets instead of only recommendation data. The current implementation is intentionally lightweight: built-in wardrobe items use self-authored procedural preview layers, while the same contract can later point to real GLB garments from a Garment Service.

## Asset Contract

Each `ClothingItem` can expose a `garmentPreviewAsset`:

- `source`: where the preview comes from, such as `stylefit-procedural-preview` or a future provider GLB.
- `layer`: render stacking order, from base clothing to outerwear, footwear, and accessory.
- `attachment`: body region used by the try-on viewer.
- `shape`: procedural silhouette for the MVP preview: shirt, trouser, skirt, jacket, shoe, or bag.
- `length` and `sleeveLength`: coarse fit controls for the silhouette.
- `fitAllowance`: extra room around the mannequin, adjusted by body profile and fit preference.
- `commercialUse`: license gate for preview or production use.

Real production garments should still return `garmentModelUri` and `garmentTextureUri`. Procedural layers are a preview fallback, not cloth simulation.

## Runtime Flow

1. `generateOutfit` selects wardrobe items for the current occasion, closet state, body profile, and weather context.
2. `getRenderableGarmentLayers` converts selected items into ordered 3D layers.
3. `TryOnModel3D` loads the avatar GLB and adds procedural garment meshes into the same rotating scene root.
4. The try-on status panel reports whether clothing coverage comes from real GLB assets or procedural preview layers.

## Upgrade Path

The next production upgrade is to replace procedural layers per item with owned or licensed garment GLB files:

```ts
{
  garmentModelUri: 'https://cdn.example.com/garments/linen-shirt.glb',
  garmentTextureUri: 'https://cdn.example.com/garments/linen-shirt-basecolor.webp',
  garmentPreviewAsset: {
    source: 'provider-glb',
    commercialUse: 'licensed'
  }
}
```

Before a garment can be marked production-ready, check that the GLB has commercial rights, mobile-friendly triangle count, stable material names, correct scale in meters, and a documented attachment region.