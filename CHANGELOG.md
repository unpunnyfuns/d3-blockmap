# Changelog

## [0.2.0](https://github.com/unpunnyfuns/d3-blockmap/compare/v0.1.0...v0.2.0) (2026-11-09)


### Features

* accessible canvas with aria-label and keyboard zoom, pan and reset ([10601ec](https://github.com/unpunnyfuns/d3-blockmap/commit/10601ec219135aaa19c79455c5e8f271e629b199))
* brush and click props for React; docs and demo ([d0ad2ed](https://github.com/unpunnyfuns/d3-blockmap/commit/d0ad2edd2cd666acdbe2d2f4204555f48e8365f9))
* brush option with block-space selection on the map ([0c97569](https://github.com/unpunnyfuns/d3-blockmap/commit/0c975690ecb908b2ae6408b336e84aff6542ab18))
* brush overlay module with block-space selection ([25bd4a5](https://github.com/unpunnyfuns/d3-blockmap/commit/25bd4a5a3c34f0ee5c3e6f974078f6f1f33aa2e8))
* explicit ARIA role description and key shortcuts; synchronous first label; React label prop ([63ae637](https://github.com/unpunnyfuns/d3-blockmap/commit/63ae63764d78e6b8a60d581641b2fd588c3cab87))
* onBlockClick reports the block or column under the pointer ([927f95f](https://github.com/unpunnyfuns/d3-blockmap/commit/927f95f344fdbbb205acfac51174b4d7be6b77f4))


### Bug Fixes

* brush click reaches onBlockClick; height resize, focus, touch and edge hits ([6728a1d](https://github.com/unpunnyfuns/d3-blockmap/commit/6728a1d66cab0fa5f02b93eecfa8baf0bf54c25a))
* brush overlay teardown mid-gesture, guarded silent flag, normalised end selection ([5a299e2](https://github.com/unpunnyfuns/d3-blockmap/commit/5a299e2cae70ffcaf91e3529cd7850a50505a4a4))
* copy view on read, refresh axis on sub-pixel width change, per-container test resize ([bd9a777](https://github.com/unpunnyfuns/d3-blockmap/commit/bd9a777749d984e4fd97f50664ed5fa56f51f2b3))
* hide tooltip off the canvas; no brush end for an unchanged press; README click wording ([e944af3](https://github.com/unpunnyfuns/d3-blockmap/commit/e944af32d149fc7f0d90110884e8683c169219a7))
* honour prefers-reduced-motion changes while highlighted ([a804a0b](https://github.com/unpunnyfuns/d3-blockmap/commit/a804a0b75d5bb264554951c2e72ca67ea981f8a8))
* ignore modified keys and drags in keyboard controls ([950d97e](https://github.com/unpunnyfuns/d3-blockmap/commit/950d97e6cee73441faca5c1142bced5301e727e4))
* re-snap a nudged brush selection; one click per press; scheduler contract comments ([43533a7](https://github.com/unpunnyfuns/d3-blockmap/commit/43533a7405c2e4c94ee3b7bccbc4ad6c1a37587d))
* react label prop removal falls back to default; spec-valid aria-keyshortcuts token ([cac3f68](https://github.com/unpunnyfuns/d3-blockmap/commit/cac3f68ca7f707553b9a07afb96b4147f631c9f5))
* **react:** apply a label supplied after mount ([1622b06](https://github.com/unpunnyfuns/d3-blockmap/commit/1622b06eb20d76e6b3f08d3cdfc8daa909e8776c))
* **react:** apply props before paint with layout effects ([0126e2e](https://github.com/unpunnyfuns/d3-blockmap/commit/0126e2eee0d60c74d475354f5a5627b6255d8bd2))
* reset click suppression on pointerdown; rename internal BinRange ([b5a5e83](https://github.com/unpunnyfuns/d3-blockmap/commit/b5a5e8331539181ceaacc328fadeadfed192df00))
* tell a click from a drag's end by how far the pointer travelled ([72b5f48](https://github.com/unpunnyfuns/d3-blockmap/commit/72b5f48f0107a61429762f13bd382f8a372a5a22))
