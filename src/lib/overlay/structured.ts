export interface StructuredAnswer { main: string; side: string; speak: string }
type Channel = keyof StructuredAnswer;
const tags = ['<main>', '</main>', '<side>', '</side>', '<speak>', '</speak>'];

/** Exact reserved tags only. All panels stream, including SPEAK for sentence TTS. */
export class StructuredParser {
  private pending = '';
  private channel: Channel = 'main';
  private answer: StructuredAnswer = { main: '', side: '', speak: '' };

  feed(chunk: string): StructuredAnswer {
    this.pending += chunk;
    while (this.pending.length) {
      const open = this.pending.indexOf('<');
      if (open < 0) {
        this.answer[this.channel] += this.pending;
        this.pending = '';
        break;
      }
      if (open > 0) {
        this.answer[this.channel] += this.pending.slice(0, open);
        this.pending = this.pending.slice(open);
      }
      const tag = tags.find(candidate => this.pending.startsWith(candidate));
      if (tag) {
        const name = tag.replace(/[<>/]/g, '') as Channel;
        if (tag.startsWith('</')) {
          if (this.channel === name) this.channel = 'main';
          else this.answer[this.channel] += tag;
        } else this.channel = name;
        this.pending = this.pending.slice(tag.length);
      } else if (tags.some(candidate => candidate.startsWith(this.pending))) {
        break; // Keep an incomplete reserved tag until the next chunk.
      } else {
        this.answer[this.channel] += '<';
        this.pending = this.pending.slice(1);
      }
    }
    return this.snapshot();
  }
  snapshot(): StructuredAnswer { return { ...this.answer }; }
  finish(): StructuredAnswer {
    this.answer[this.channel] += this.pending;
    this.pending = '';
    return this.snapshot();
  }
}
export function parseStructured(text: string): StructuredAnswer {
  const parser = new StructuredParser();
  parser.feed(text);
  return parser.finish();
}

export const DEFAULT_STRUCTURED_PROMPT = `Separate the response into <main>the direct answer or solution</main>, <side>supporting explanations, caveats, and useful next steps</side>, and <speak>a natural spoken explanation in plain language</speak>. Keep the exact channel tags. Follow the requested response language and length. Put formulas and code in main or side; explain symbols in words in speak. Avoid repeating the same text in every channel.`;
