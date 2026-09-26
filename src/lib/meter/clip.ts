// Zero-shot image classification with CLIP via Transformers.js. Shared by the browser worker and the Node eval script.
import { AutoProcessor, AutoTokenizer, CLIPTextModelWithProjection, CLIPVisionModelWithProjection, type RawImage, type Tensor } from '@huggingface/transformers';

function normalise(v: ArrayLike<number>) { let n = 0; for (let i = 0; i < v.length; i++) n += v[i] * v[i]; n = Math.sqrt(n) || 1; return Array.from(v, x => x / n); }
function rows(t: Tensor): number[][] { const [b, d] = t.dims as number[]; const data = t.data as Float32Array; return Array.from({ length: b }, (_, i) => normalise(data.subarray(i * d, (i + 1) * d))); }

/** `classify` returns one logit per prompt (100 × cosine similarity); soften per prompt set with softmax. */
export type Clip = { classify(image: RawImage): Promise<number[]> };

/** Loads CLIP (8-bit quantised) and pre-computes the prompt embeddings once. */
export async function loadClip(modelId: string, prompts: string[], device: 'wasm' | 'cpu' = 'wasm'): Promise<Clip> {
  const opts = { dtype: 'q8' as const, device };
  const [tokenizer, processor, text, vision] = await Promise.all([
    AutoTokenizer.from_pretrained(modelId),
    AutoProcessor.from_pretrained(modelId),
    CLIPTextModelWithProjection.from_pretrained(modelId, opts),
    CLIPVisionModelWithProjection.from_pretrained(modelId, opts),
  ]);
  const { text_embeds } = await text(tokenizer(prompts, { padding: true, truncation: true })) as { text_embeds: Tensor };
  const textEmbeds = rows(text_embeds);
  return {
    async classify(image) {
      const { pixel_values } = await processor(image);
      const { image_embeds } = await vision({ pixel_values }) as { image_embeds: Tensor };
      const img = rows(image_embeds)[0];
      return textEmbeds.map(t => 100 * t.reduce((s, v, i) => s + v * img[i], 0)); // CLIP's learned logit scale ≈ 100
    },
  };
}
