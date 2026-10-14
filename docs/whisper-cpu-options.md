# Whisper CPU engine and recognition options

Checked against official sources on **2026-10-13**. This is research; it does not change Fluely's runtime or model pins.

## The existing engine is already current

The official latest stable release is [whisper.cpp v1.9.5](https://github.com/ggml-org/whisper.cpp/releases/tag/v1.9.5), published on October 6. It identifies [b5454](https://github.com/ggml-org/whisper.cpp/releases/tag/b5454) as its binary build. Both point to commit `d1be6fde11ac6e0407606b4e42fe72d34add8037`; the [official comparison](https://api.github.com/repos/ggml-org/whisper.cpp/compare/b5454...v1.9.5) reports `identical`, zero commits ahead or behind.

The stable tag has no uploaded Windows binary assets. The `b5454` prerelease contains the Windows binaries for that same stable source commit. Fluely already pins its plain x64 CPU package, so switching the download URL to `v1.9.5` would not provide a newer executable and would not find that package.

## Official Windows x64 CPU assets

The [GitHub release API](https://api.github.com/repos/ggml-org/whisper.cpp/releases/tags/b5454) reports:

| Package | Bytes | SHA-256 | Assessment |
|---|---:|---|---|
| [whisper-bin-x64.zip](https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip) | 8,928,640 | `6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb` | Current Fluely package; retain as the baseline. |
| [whisper-blas-bin-x64.zip](https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-blas-bin-x64.zip) | 21,715,607 | `b1158bd10edf92c9799149a6fc5d3e58da3f495241d6fb3423088130e88ffbf3` | Optional CPU/OpenBLAS candidate for benchmarking; same source version, not an accuracy upgrade. |

Hashes above are upstream GitHub asset digests, not newly computed local-download hashes. The plain package digest matches Fluely's existing `local_engines.rs` pin. No package was installed, replaced, or executed for this research.

The [official release workflow](https://github.com/ggml-org/whisper.cpp/blob/b5454/.github/workflows/release.yml) builds plain x64 with dynamic CPU backend variants and `GGML_NATIVE=OFF`. Its BLAS job additionally enables OpenBLAS and packages `libopenblas.dll`. Preserve the complete archive and licenses rather than copying only the server executable. The NVIDIA CUDA archives are different GPU packages and are not CPU upgrade recommendations.

## Model choices offer the useful quality path

Whisper engine updates and model accuracy are separate. [OpenAI's model guidance](https://github.com/openai/whisper#available-models-and-languages) describes the size/speed tradeoff and language-dependent performance. For Ukrainian, Russian, or mixed-language speech, choose multilingual weights; `.en` variants are English-only.

The [whisper.cpp model guide](https://github.com/ggml-org/whisper.cpp/blob/b5454/models/README.md) points to the official preconverted GGML files. The following SHA-256 and sizes come from [Hugging Face LFS metadata](https://huggingface.co/api/models/ggerganov/whisper.cpp/revision/5359861c739e955e79d9a303bcbc70fb988958b1?blobs=true), pinned to revision `5359861c739e955e79d9a303bcbc70fb988958b1`. Upstream's README also contains 40-character hashes; those are not substitutes for these SHA-256 values.

| Multilingual model | Bytes | SHA-256 | Candidate use |
|---|---:|---|---|
| [base](https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-base.bin) | 147,951,465 | `60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe` | First model to evaluate above the current tiny default. |
| [base Q5_1](https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-base-q5_1.bin) | 59,707,625 | `422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898` | Lower disk/memory option; benchmark quantization's quality tradeoff. |
| [small](https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-small.bin) | 487,601,967 | `1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b` | Larger quality candidate with more CPU work. |
| [small Q5_1](https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-small-q5_1.bin) | 190,085,487 | `ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb` | More compact small-model candidate. |
| [large-v3-turbo Q5_0](https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-large-v3-turbo-q5_0.bin) | 574,041,195 | `394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2` | Optional heavier candidate; CPU latency needs measurement. |

These are compatible-format research candidates, not models benchmarked by this task or newly added to the one-click downloader. Select a trusted downloaded `.bin` file in Local engines to try it. Keep its MIT license and source metadata. A smaller quantized file is not evidence that its inference is faster or more accurate on a particular machine.

## Existing settings and possible future work

Fluely already passes its language and thread settings to the Whisper server. Set a known language such as `uk`, `ru`, or `en` when appropriate; retain `auto` for genuinely changing languages. Start with the existing four-thread CPU configuration and measure before increasing threads.

The [official server interface](https://github.com/ggml-org/whisper.cpp/blob/b5454/examples/server/README.md) also supports beam size, best-of decoding, prompt conditioning, fallback thresholds, and VAD. Fluely's managed launch currently does not expose all those options. They are possible future quality controls, not current UI features or a reason to imply a newer engine was installed. Larger beams/candidate counts can add latency; prompts can bias transcription.

Recommendation: **retain the verified b5454 CPU engine**, offer or manually evaluate multilingual base/small weights, and compare word errors and segment latency on representative audio before changing defaults. Benchmark the BLAS variant separately if CPU performance is the concern. No speed or accuracy improvement was established by metadata inspection alone.
