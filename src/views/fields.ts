import { html } from 'hono/html'
import type { Html } from './layout.ts'

/**
 * Formularfelder mit Label und Fehlermeldung, für Admin und Anmeldung.
 *
 * Die Meldung wird mit dem Feld gerendert und ist beim Laden schon da — das
 * Feld verweist per `aria-describedby` darauf und trägt `aria-invalid`. Eine
 * Live-Region braucht es dafür nicht: der Screenreader liest die Meldung, wenn
 * das Feld den Fokus bekommt.
 */

export interface FieldOptions {
  name: string
  label: string
  value?: string
  error?: string
  /** Erklärung unter dem Label, immer sichtbar. */
  hint?: string
  required?: boolean
}

export interface InputOptions extends FieldOptions {
  type?: 'text' | 'email' | 'password' | 'date' | 'time' | 'number'
  autocomplete?: string
  min?: string
  max?: string
  maxlength?: number
  inputmode?: 'numeric' | 'email' | 'text'
}

function fieldId(name: string): string {
  return `feld-${name.replaceAll('_', '-')}`
}

/** IDs von Hinweis und Fehler, auf die das Feld verweist — oder nichts. */
function describedBy(options: FieldOptions): string | undefined {
  const id = fieldId(options.name)
  const ids = [options.hint ? `${id}-hinweis` : null, options.error ? `${id}-fehler` : null].filter(Boolean)
  return ids.length > 0 ? ids.join(' ') : undefined
}

function messages(options: FieldOptions): Html {
  const id = fieldId(options.name)

  return html`${options.hint ? html`<p class="field__hint" id="${id}-hinweis">${options.hint}</p>` : ''}
    ${options.error ? html`<p class="field__error" id="${id}-fehler">${options.error}</p>` : ''}`
}

/**
 * Optionale Attribute: hono/html lässt `undefined` als leeren String stehen,
 * deshalb hier ausgeschrieben statt `min="${undefined}"`.
 */
function optional(name: string, value: string | number | undefined): Html | string {
  return value === undefined ? '' : html` ${name}="${String(value)}"`
}

export function input(options: InputOptions): Html {
  const id = fieldId(options.name)
  const described = describedBy(options)

  return html`<div class="field">
      <label class="field__label" for="${id}">${options.label}</label>
      ${messages(options)}
      <input
        class="field__control"
        id="${id}"
        name="${options.name}"
        type="${options.type ?? 'text'}"
        value="${options.value ?? ''}"${optional('autocomplete', options.autocomplete)}${optional(
          'min',
          options.min,
        )}${optional('max', options.max)}${optional('maxlength', options.maxlength)}${optional(
          'inputmode',
          options.inputmode,
        )}${optional('aria-describedby', described)}${options.error
          ? html` aria-invalid="true"`
          : ''}${options.required ? html` required` : ''}
      />
    </div>`
}

export interface TextareaOptions extends FieldOptions {
  maxlength?: number
  rows?: number
}

export function textarea(options: TextareaOptions): Html {
  const id = fieldId(options.name)
  const described = describedBy(options)

  return html`<div class="field">
      <label class="field__label" for="${id}">${options.label}</label>
      ${messages(options)}
      <textarea
        class="field__control"
        id="${id}"
        name="${options.name}"
        rows="${options.rows ?? 3}"${optional('maxlength', options.maxlength)}${optional(
          'aria-describedby',
          described,
        )}${options.error ? html` aria-invalid="true"` : ''}${options.required ? html` required` : ''}
      >${options.value ?? ''}</textarea>
    </div>`
}

export interface ChoiceOptions extends FieldOptions {
  choices: { value: string; label: string }[]
}

/**
 * Auswahl als Radio-Gruppe in einem `fieldset`: bei zwei bis drei Optionen
 * sind alle auf einen Blick sichtbar, ein `<select>` versteckte sie.
 */
export function radios(options: ChoiceOptions): Html {
  const id = fieldId(options.name)
  const described = describedBy(options)

  return html`<fieldset class="field"${optional('aria-describedby', described)}>
      <legend class="field__label">${options.label}</legend>
      ${messages(options)}
      ${options.choices.map(
        (choice) =>
          html`<label class="choice">
            <input
              type="radio"
              name="${options.name}"
              value="${choice.value}"${choice.value === options.value ? html` checked` : ''}${options.required
                ? html` required`
                : ''}
            />
            ${choice.label}
          </label>`,
      )}
    </fieldset>`
}

export interface SelectOptions extends FieldOptions {
  choices: { value: string; label: string }[]
}

export function select(options: SelectOptions): Html {
  const id = fieldId(options.name)
  const described = describedBy(options)

  return html`<div class="field">
      <label class="field__label" for="${id}">${options.label}</label>
      ${messages(options)}
      <select class="field__control" id="${id}" name="${options.name}"${optional(
        'aria-describedby',
        described,
      )}${options.error ? html` aria-invalid="true"` : ''}${options.required ? html` required` : ''}>
        ${options.choices.map(
          (choice) =>
            html`<option value="${choice.value}"${choice.value === options.value ? html` selected` : ''}>
              ${choice.label}
            </option>`,
        )}
      </select>
    </div>`
}

export function checkbox(options: FieldOptions & { checked?: boolean }): Html {
  const id = fieldId(options.name)
  const described = describedBy(options)

  return html`<div class="field">
      ${messages(options)}
      <label class="choice" for="${id}">
        <input type="checkbox" id="${id}" name="${options.name}" value="1"${options.checked
          ? html` checked`
          : ''}${optional('aria-describedby', described)} />
        ${options.label}
      </label>
    </div>`
}
