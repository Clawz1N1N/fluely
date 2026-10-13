# Screen vision methods

Fluely has two screen-to-text pipelines. Both consume the existing changed-frame capture stream and retain per-monitor observations for up to 120 seconds. The reasoning model receives bounded text; screenshots are never silently treated as OCR-only visual understanding. Attached images can still go directly to an image-capable reasoning model.

## Screenshot → visual model → text reasoning

A separate registered image-capable model receives each changed screenshot and a factual scene-description prompt. Its output describes visible pictures, charts, diagrams, colors, layout and clearly readable text. OCR and Windows UI Automation are optional supplemental evidence. The reasoning model then receives those scene observations together with the question or transcript.

The model selector accepts enabled registered reasoning or vision models whose metadata says they accept images. Selecting a particular model reserves requests against that model and its quotas; automatic selection uses the available models in rank order. A missing or failed visual model produces an explicit vision error rather than an OCR replacement or a failure attributed to the reasoning model. Prepared observations are reused when the reasoning provider falls back.

## Pixel-to-text (experimental)

This is an actual pixel representation, inspired by [TheiaVision](https://github.com/frank-and-theia/theiavision). It is generated in the existing Rust image worker on the CPU and uses the already-bundled image library. There is no new Python, CUDA, graphics runtime or model download.

The screenshot is decoded and reduced to a small grid. Each Unicode cell encodes two vertical luminance samples: `▀` for a bright top sample, `▄` for a bright bottom sample, `█` for both, and a space for neither. A weighted RGB luminance threshold of 128/255 matches the fundamental half-block encoding in TheiaVision's [converter](https://github.com/frank-and-theia/theiavision/blob/main/ascii_converter_blocks.py).

Fluely preserves the screenshot aspect ratio instead of forcing TheiaVision's fixed 64-by-72 sample dimensions. A separate, spatially aligned color grid classifies averaged samples into black, white, neutral gray and seven hue categories. Both grids include dimensions, direction and legends. The grids shrink together until a complete frame fits the character budget, rather than truncating a row and corrupting its geometry. The per-frame cap is 4096 characters; monitor memory and the request context are also bounded. OCR, if available, is appended only after the pixel maps. OCR failure does not remove the pixel representation.

The text reasoning model directly interprets the grids. It does not invoke an independent VLM. This makes the conversion suitable for an 8 GB laptop with an Intel integrated GPU, but does not establish that the chosen reasoning model can interpret the representation accurately. Unicode grids can consume roughly a token per cell depending on the tokenizer.

This method can retain coarse silhouettes, geometry, spatial layout and color placement. It is lossy: tiny interface text, thin lines, similar luminance colors, detailed photographs and exact object counts can disappear. It does not contain an object detector, segmentation model or learned visual encoder. Object recognition is experimental and depends on the reasoning model. No accuracy or speed claim from TheiaVision's README has been validated or adopted as a Fluely guarantee.

## Why VDLM is not the second method

[VDLM](https://github.com/MikeWangWZHL/VDLM) is a different architecture: raster image → SVG → learned Primal Visual Description (PVD JSON) → reasoning. The project's [README](https://github.com/MikeWangWZHL/VDLM/blob/main/README.md) documents a fine-tuned Mistral 7B SVG-to-PVD model and vLLM inference with `CUDA_VISIBLE_DEVICES=0`. Its demonstrated domain is vector graphics. It is not a drop-in screenshot interpretation service for a Windows laptop without CUDA.

Vectorization and PVD are promising for clean diagrams and charts, but deploying the published model stack would add a substantial model and runtime beside the user's existing reasoning model. This implementation does not claim to reproduce VDLM and does not redistribute its code or weights. The repository's website license statement alone does not establish a general code license for importing its implementation.

## Source and license

TheiaVision, François & Theia, July 2026, is MIT licensed. The half-block method is implemented in Rust for Fluely with aspect-ratio preservation, bounded grids and an additional spatial color representation. Its notice is preserved in [theiavision-MIT.txt](licenses/theiavision-MIT.txt).

Primary sources were inspected on 2026-10-13. Native tests exercise the four half-block combinations, spatial red/green/blue/white placement, landscape and portrait budgeting, and insufficient budgets. Runtime tests exercise pixel routing without a VLM, semantic scene reuse, explicit vision failures, attachment routing and image-capable model selection in settings. These checks verify conversion and integration, not semantic visual recognition accuracy.
