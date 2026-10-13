import type { ProviderEntry } from '@/lib/overlay/provider-types';
import type { VisionSettings } from '@/lib/overlay/screen-context';
import {t} from '@/lib/i18n';
import type {ReactNode} from 'react';

const control='w-full rounded-md border border-input bg-background px-3 py-2 text-sm';
function Field({label,children}:{label:string;children:ReactNode}) {
  return <label className="grid gap-1.5 text-sm"><span className="font-medium">{t(label)}</span>{children}</label>;
}
export function VisionMethodSettings({value,onChange,providers,onRefresh}:{value:VisionSettings;onChange(value:VisionSettings):void;providers:ProviderEntry[];onRefresh?():void}) {
  const method=value.method??'semantic';
  const models=providers.filter(provider=>provider.enabled&&provider.supports_images&&(provider.kind==='brain'||provider.kind==='vision'));
  const selected=value.vision_provider_id??'';
  const missing=selected&&!models.some(provider=>provider.id===selected);
  return <div className="space-y-4">
    <Field label="Screen vision method"><select className={control} value={method} onChange={event=>onChange({...value,method:event.target.value as VisionSettings['method'],max_chars:event.target.value==='pixel-text'?Math.max(1024,value.max_chars):value.max_chars})}>
      <option value="semantic">{t('Screenshot → visual model → text reasoning')}</option>
      <option value="pixel-text">{t('Pixel-to-text (experimental, local CPU)')}</option>
    </select></Field>
    {method==='semantic'?<>
      <p className="text-sm text-muted-foreground">{t('An independent image-capable model describes changed screenshots. The reasoning model receives its text observations.')}</p>
      <Field label="Vision model"><select className={control} value={selected} onFocus={onRefresh} onChange={event=>onChange({...value,vision_provider_id:event.target.value||null})}>
        <option value="">{t('Automatic: available image-capable models by rank')}</option>
        {missing&&<option value={selected} disabled>{t('Selected model is unavailable')}</option>}
        {models.map(provider=><option key={provider.id} value={provider.id}>{provider.display_name||provider.provider_id||provider.preset} — {provider.model_display_name||provider.model}</option>)}
      </select></Field>
      {(!models.length||missing)&&<p role="alert" className="text-sm text-destructive">{t('Register and enable an image-capable model in Models, then select it here.')}</p>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.mode!=='vlm'} onChange={event=>onChange({...value,mode:event.target.checked?'full':'vlm'})}/>{t('Add OCR and interface text when available')}</label>
    </>:<>
      <p className="text-sm text-muted-foreground">{t('Converts screenshot pixels into a Unicode luminance grid and a spatial color map on the CPU. No extra vision model is loaded. The text reasoning model interprets the maps.')}</p>
      <p className="text-sm text-muted-foreground">{t('Experimental: preserves coarse layout, shapes and colors. Recognition of objects, small text and exact counts is unreliable. OCR is supplemental; this method does not provide VLM-quality understanding.')}</p>
      <Field label="Pixel grid width"><input className={control} type="number" min={24} max={96} step={1} required value={value.pixel_width??64} onChange={event=>onChange({...value,pixel_width:Number(event.target.value)})}/></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.pixel_colors??true} onChange={event=>onChange({...value,pixel_colors:event.target.checked})}/>{t('Include spatial color map')}</label>
      <p className="text-xs text-muted-foreground">{t('Larger grids use more text context. Complete grids shrink automatically to fit the per-frame budget.')}</p>
      <a href="https://github.com/frank-and-theia/theiavision" target="_blank" rel="noreferrer" className="text-xs underline">{t('Method inspired by TheiaVision (MIT)')}</a>
    </>}
    <Field label="Maximum screen context characters"><input className={control} type="number" min={method==='pixel-text'?1024:64} max={32000} step={1} required value={value.max_chars} onChange={event=>onChange({...value,max_chars:Number(event.target.value)})}/></Field>
    {method==='semantic'&&value.mode!=='vlm'&&<details className="space-y-3 text-sm"><summary className="cursor-pointer">{t('Advanced OCR and interface settings')}</summary>
      <Field label="Interface tree depth"><input className={control} type="number" min={0} max={16} step={1} required value={value.ui_max_depth} onChange={event=>onChange({...value,ui_max_depth:Number(event.target.value)})}/></Field>
      <Field label="Maximum interface characters"><input className={control} type="number" min={64} max={16000} step={1} required value={value.ui_max_chars} onChange={event=>onChange({...value,ui_max_chars:Number(event.target.value)})}/></Field>
    </details>}
  </div>;
}
