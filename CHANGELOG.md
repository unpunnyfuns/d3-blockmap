# Changelog

## [0.2.0](https://github.com/unpunnyfuns/d3-blockmap/compare/v0.1.0...v0.2.0) (2026-11-09)


### Features

* addRanges and removeRanges on createBlockMap and React handle ([a36cc5c](https://github.com/unpunnyfuns/d3-blockmap/commit/a36cc5c516ac5baa4c93694ecce2ebf02903787d))
* axis option and getScale on createBlockMap ([f9adb40](https://github.com/unpunnyfuns/d3-blockmap/commit/f9adb40c84b15ec4742ac1f3c599f4172eda85b8))
* axis ticks, scale and default compact format ([7742e7c](https://github.com/unpunnyfuns/d3-blockmap/commit/7742e7c7f9fd8f979c3bee8b91d635476cffd0d7))
* bins addRange ([e5665c8](https://github.com/unpunnyfuns/d3-blockmap/commit/e5665c8ee6216d654adfe0083e227d6d76306f3c))
* bitset bulk fill and setCount ([c6ee8fd](https://github.com/unpunnyfuns/d3-blockmap/commit/c6ee8fd90252d713f9f4521225d0c2b6c605af86))
* bitset clearRange and bins recount ([c18dd1b](https://github.com/unpunnyfuns/d3-blockmap/commit/c18dd1b2f1ee572c9811b9fe98c34a3c1c94a2a1))
* block to bin mapping ([ffe43cc](https://github.com/unpunnyfuns/d3-blockmap/commit/ffe43cca57ed31c27c5264247801db156d1b720c))
* canvas renderer with dirty column blitting ([f7aa5a1](https://github.com/unpunnyfuns/d3-blockmap/commit/f7aa5a17b57447d905840f2ac1652d5784ee6bd1))
* coverage default, 32-bit block cap, flat range arrays, imperative setRanges ([2cc55dd](https://github.com/unpunnyfuns/d3-blockmap/commit/2cc55dd0e6b774ff4bfbdc8d14ebfde680f927cb))
* coverage partial colour style ([e5dce6d](https://github.com/unpunnyfuns/d3-blockmap/commit/e5dce6d3b67eb816106e0080f895fc3c5cbe2f87))
* createPieceMap orchestrator and public exports ([397ec1f](https://github.com/unpunnyfuns/d3-blockmap/commit/397ec1f43f6676f41b7e51ccd3b0115951ac7290))
* packed bitset ([93e0a3b](https://github.com/unpunnyfuns/d3-blockmap/commit/93e0a3b35ed6728602d5ac6d65480a4f03b3b0c5))
* piece state with dirty bin tracking ([0493016](https://github.com/unpunnyfuns/d3-blockmap/commit/049301625a44ff49461b4740694cc6a929912ebc))
* range normalisation ([23fe23a](https://github.com/unpunnyfuns/d3-blockmap/commit/23fe23ac4d5bb4c341a379f56dae594cb6fcb662))
* React axis prop and getScale handle ([4b8e950](https://github.com/unpunnyfuns/d3-blockmap/commit/4b8e950de9eb74c524ed9a69488b6a91e382a539))
* React PieceMap wrapper ([d412ada](https://github.com/unpunnyfuns/d3-blockmap/commit/d412ada7c41861d8530cf60731d08279644e57ef))
* React ranges and partial props ([260bab3](https://github.com/unpunnyfuns/d3-blockmap/commit/260bab3ffa4e50a6358102620494fe38b34ea059))
* React view, interactive, onViewChange and highlight props ([3081957](https://github.com/unpunnyfuns/d3-blockmap/commit/30819572c035260cc03c4d01c56225fdfde8636c))
* renderer highlight phase and view-aware discrete mode ([a257c00](https://github.com/unpunnyfuns/d3-blockmap/commit/a257c009ca5b6e398a6c9109c2ecf2df997fdedc))
* setRanges, initialRanges and partial option ([f2ce09d](https://github.com/unpunnyfuns/d3-blockmap/commit/f2ce09dfe6bf659d56c9a93baf4c7ed0fca00e6e))
* state addRanges and removeRanges with exact overlap handling ([6f238cc](https://github.com/unpunnyfuns/d3-blockmap/commit/6f238ccfdc6a64dc2402d2032df1a8918260c98a))
* state replaceRanges ([5cdef30](https://github.com/unpunnyfuns/d3-blockmap/commit/5cdef3039aac30629cadf45cd29d0edb64783eb7))
* state view window with setView and getView ([0a21d10](https://github.com/unpunnyfuns/d3-blockmap/commit/0a21d10850d65eba77fd203e785f654402f42d4a))
* theme reading and colour lookup table ([dde0230](https://github.com/unpunnyfuns/d3-blockmap/commit/dde02304dd31ac743317b09c7d57e5334b24959e))
* three-stop coverage ramp through --block-partial ([f7b887e](https://github.com/unpunnyfuns/d3-blockmap/commit/f7b887e04e51599a7f548310019b476fffa230e5))
* tooltip element and formatting ([d4cdbcc](https://github.com/unpunnyfuns/d3-blockmap/commit/d4cdbcc94090b88aa8d6da361bf712215bb88022))
* view math helpers and interaction constants ([7aa560a](https://github.com/unpunnyfuns/d3-blockmap/commit/7aa560ad41d6dd4a5ed5348c72a0cbace5cf8370))
* view-relative bins with clipped addRange ([739a142](https://github.com/unpunnyfuns/d3-blockmap/commit/739a1421d7e9d75137a0a7206e03070524042001))
* view, interaction and highlight on createBlockMap ([48bc621](https://github.com/unpunnyfuns/d3-blockmap/commit/48bc62186b039f7e72a73c06ca235c949b50f3c8))
* wheel zoom, drag pan and double-click reset interaction ([c4e3204](https://github.com/unpunnyfuns/d3-blockmap/commit/c4e3204e8f32b7b7f07817cdc5af708ca0070bda))


### Bug Fixes

* clear pending view on destroy ([034d321](https://github.com/unpunnyfuns/d3-blockmap/commit/034d321fafc9c3172530f89d0a7267b7bad99dde))
* coalesce frames on a flag so synchronous schedulers do not stall repaints ([3edbe85](https://github.com/unpunnyfuns/d3-blockmap/commit/3edbe85f4b0a812f12faf39c30f909866f179da1))
* integer tick steps, step-aware labels, committed-view getScale, shared ensureRelative ([b91c345](https://github.com/unpunnyfuns/d3-blockmap/commit/b91c345c1b73e17403b621c2c372eb1a4f86ae0d))
* skip redundant layouts, guard zero-bin rebuild and stale dirty columns ([b5bee52](https://github.com/unpunnyfuns/d3-blockmap/commit/b5bee523d3a0364bb6d034880a97858792d4c6e9))
* symmetric percent formatting and tooltip position tests ([6c0b96d](https://github.com/unpunnyfuns/d3-blockmap/commit/6c0b96de0e668e30231b5464a354228f528d1f35))
* zoom floor, discrete tooltip inverse, per-frame view coalescing, wheel-during-drag, highlight colour refresh ([a929d4d](https://github.com/unpunnyfuns/d3-blockmap/commit/a929d4d1af27ea4d201bd6c3439d7af784df0b24))


### Performance Improvements

* rebuild bins with byte-level popcount for 100M-block resizes ([2723431](https://github.com/unpunnyfuns/d3-blockmap/commit/27234313b304412d04bac50dbe2e5457b8dab775))
* recount touched bins once per batch; sorted dirty arrays ([1684ab8](https://github.com/unpunnyfuns/d3-blockmap/commit/1684ab8b27fc31dc2b2b758976704ba8f2b81ad9))
