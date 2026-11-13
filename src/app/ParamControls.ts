import type { EngineId, ParamFieldSchema, TextOverlayParams } from '../core/types.ts';
import { ENGINE_METADATA_MAP } from './EngineRegistry.ts';

export interface ParamControlsCallbacks {
  onParamChange: () => void;
  onAction: (actionId: string) => void;
}

export function renderParamControls(
  container: HTMLElement,
  engineId: EngineId,
  params: Record<string, unknown>,
  textOverlay: TextOverlayParams,
  callbacks: ParamControlsCallbacks
): void {
  container.replaceChildren();
  const meta = ENGINE_METADATA_MAP[engineId];
  const conditionalWrappers = new Map<string, { el: HTMLElement; key: string; equals: string }>();

  meta.fields.forEach((field, index) => {
    const group = createFieldElement(field, params, index > 0, (key, value) => {
      params[key] = value;
      conditionalWrappers.forEach((entry) => {
        if (entry.key === key) {
          entry.el.style.display = String(value) === entry.equals ? 'block' : 'none';
        }
      });
      callbacks.onParamChange();
    }, callbacks.onAction);

    if (field.type === 'text' && field.visibleWhen) {
      const currentVal = String(params[field.visibleWhen.key] ?? '');
      group.style.display = currentVal === field.visibleWhen.equals ? 'block' : 'none';
      conditionalWrappers.set(field.key, {
        el: group,
        key: field.visibleWhen.key,
        equals: field.visibleWhen.equals,
      });
    }

    container.appendChild(group);
  });

  container.appendChild(createTextOverlaySection(textOverlay, callbacks.onParamChange));
}

function createFieldElement(
  field: ParamFieldSchema,
  params: Record<string, unknown>,
  addTopMargin: boolean,
  onUpdate: (key: string, value: unknown) => void,
  onAction: (actionId: string) => void
): HTMLElement {
  const group = document.createElement('div');
  group.className = 'param-group';
  if (addTopMargin) {
    group.style.marginTop = field.type === 'action' ? '16px' : '12px';
  }

  if (field.type === 'action') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = `btn-${field.id}`;
    btn.className = 'action-btn';
    btn.textContent = field.label;
    btn.addEventListener('click', () => onAction(field.id));
    group.appendChild(btn);
    return group;
  }

  if (field.type === 'checkbox') {
    group.style.display = 'flex';
    group.style.alignItems = 'center';
    group.style.gap = '8px';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = `input-${field.key}`;
    input.checked = Boolean(params[field.key]);

    const label = document.createElement('label');
    label.htmlFor = input.id;
    label.textContent = field.label;
    label.style.marginBottom = '0';

    input.addEventListener('change', () => onUpdate(field.key, input.checked));
    group.append(input, label);
    return group;
  }

  if (field.type === 'range') {
    const currentValue = Number(params[field.key] ?? field.min);
    const label = document.createElement('label');
    label.append(document.createTextNode(`${field.label}: `));
    const valueTag = document.createElement('b');
    valueTag.id = `val-${field.key}`;
    valueTag.textContent = `${currentValue}${field.unit ?? ''}`;
    label.appendChild(valueTag);

    const input = document.createElement('input');
    input.type = 'range';
    input.id = `input-${field.key}`;
    input.min = String(field.min);
    input.max = String(field.max);
    if (field.step !== undefined) input.step = String(field.step);
    input.value = String(currentValue);

    input.addEventListener('input', () => {
      const val = parseFloat(input.value);
      valueTag.textContent = `${val}${field.unit ?? ''}`;
      onUpdate(field.key, val);
    });

    group.append(label, input);

    if (field.hint) {
      const hint = document.createElement('small');
      hint.className = 'param-hint';
      hint.textContent = field.hint;
      group.appendChild(hint);
    }

    return group;
  }

  if (field.type === 'select') {
    const label = document.createElement('label');
    label.textContent = field.label;

    const select = document.createElement('select');
    select.id = `input-${field.key}`;
    const currentStr = String(params[field.key] ?? '');

    for (const opt of field.options) {
      const optionEl = document.createElement('option');
      optionEl.value = opt.value;
      optionEl.textContent = opt.label;
      if (opt.value === currentStr) optionEl.selected = true;
      select.appendChild(optionEl);
    }

    select.addEventListener('change', () => {
      const val = field.isNumeric ? parseInt(select.value, 10) : select.value;
      onUpdate(field.key, val);
    });

    group.append(label, select);
    return group;
  }

  // field.type === 'text'
  const label = document.createElement('label');
  label.textContent = field.label;
  const input = document.createElement('input');
  input.type = 'text';
  input.id = `input-${field.key}`;
  input.value = String(params[field.key] ?? '');
  if (field.placeholder) input.placeholder = field.placeholder;

  input.addEventListener('input', () => onUpdate(field.key, input.value));
  group.append(label, input);
  return group;
}

function createTextOverlaySection(
  textOverlay: TextOverlayParams,
  onParamChange: () => void
): HTMLElement {
  const section = document.createElement('div');
  section.className = 'global-param-section';

  const heading = document.createElement('h3');
  heading.className = 'overlay-heading';
  heading.textContent = 'Metin Damgası (Onomatopoeia)';
  section.appendChild(heading);

  const frameGroup = document.createElement('div');
  frameGroup.className = 'param-group param-checkbox-row';
  const frameInput = document.createElement('input');
  frameInput.type = 'checkbox';
  frameInput.id = 'input-textOverlay-comicFrame';
  frameInput.checked = textOverlay.comicFrame;
  const frameLabel = document.createElement('label');
  frameLabel.htmlFor = frameInput.id;
  frameLabel.textContent = 'Çizgi Roman Kapak Çerçevesi';
  frameInput.addEventListener('change', () => {
    textOverlay.comicFrame = frameInput.checked;
    onParamChange();
  });
  frameGroup.append(frameInput, frameLabel);
  section.appendChild(frameGroup);

  const enableGroup = document.createElement('div');
  enableGroup.className = 'param-group param-checkbox-row';
  enableGroup.style.marginTop = '10px';
  const enableInput = document.createElement('input');
  enableInput.type = 'checkbox';
  enableInput.id = 'input-textOverlay-enabled';
  enableInput.checked = textOverlay.enabled;
  const enableLabel = document.createElement('label');
  enableLabel.htmlFor = enableInput.id;
  enableLabel.textContent = 'Efekt Metni Ekle';
  enableGroup.append(enableInput, enableLabel);
  section.appendChild(enableGroup);

  const subControls = document.createElement('div');
  subControls.id = 'text-overlay-controls';
  subControls.className = 'overlay-subcontrols';
  subControls.style.display = textOverlay.enabled ? 'block' : 'none';

  const textGroup = document.createElement('div');
  textGroup.className = 'param-group';
  const textInput = document.createElement('input');
  textInput.type = 'text';
  textInput.id = 'input-textOverlay-text';
  textInput.value = textOverlay.text;
  textInput.placeholder = 'Örn: THWIP!, BOOM!';
  textInput.addEventListener('input', () => {
    textOverlay.text = textInput.value;
    onParamChange();
  });
  textGroup.appendChild(textInput);

  const colorGroup = document.createElement('div');
  colorGroup.className = 'param-group';
  colorGroup.style.marginTop = '8px';
  const colorLabel = document.createElement('label');
  colorLabel.textContent = 'Metin Rengi';
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.id = 'input-textOverlay-color';
  colorInput.value = textOverlay.color;
  colorInput.className = 'color-picker-input';
  colorInput.addEventListener('input', () => {
    textOverlay.color = colorInput.value;
    onParamChange();
  });
  colorGroup.append(colorLabel, colorInput);

  enableInput.addEventListener('change', () => {
    textOverlay.enabled = enableInput.checked;
    subControls.style.display = textOverlay.enabled ? 'block' : 'none';
    onParamChange();
  });

  subControls.append(textGroup, colorGroup);
  section.appendChild(subControls);
  return section;
}
