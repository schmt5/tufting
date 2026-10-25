import { html } from 'hono/html'
import { type FieldErrors, MAX_BODY_LENGTH, MAX_SUBJECT_LENGTH } from '../../forms.ts'
import { PLACEHOLDERS, type SignupMail } from '../../template.ts'
import { input, textarea } from '../fields.ts'
import type { Html } from '../layout.ts'

export interface TemplateViewOptions {
  values: { subject: string; body: string }
  errors?: FieldErrors
  /** Gibt es noch keine eigene Fassung, steht der Standardtext da. */
  isDefault: boolean
  /** Platzhalter im Text, die es nicht gibt. */
  unknown: string[]
  /** Die Vorlage mit Beispielwerten, so wie sie in der Mail stünde. */
  preview: SignupMail
}

export function renderTemplateForm(options: TemplateViewOptions): Html {
  const errors = options.errors ?? {}

  return html`<div class="prose prose--narrow">
      <p class="back"><a href="/admin">Alle Termine</a></p>
      <h1 class="page-title">E-Mail-Vorlage</h1>
      <p>
        Der Text für deine Antwort auf eine Anmeldung. „E-Mail schreiben“ bei einer Anmeldung öffnet
        deine Mail-App mit diesem Text, ausgefüllt für die Person. Du kannst ihn dort noch ändern.
      </p>
      ${options.isDefault ? html`<p class="note">Noch der Standardtext — speichern macht ihn zu deinem.</p>` : ''}
      ${options.unknown.length > 0
        ? html`<p class="flash">
            Diese Platzhalter gibt es nicht und bleiben so in der Mail stehen:
            ${options.unknown.map((name) => `{${name}}`).join(', ')}
          </p>`
        : ''}

      <form class="form" method="post" action="/admin/vorlage">
        ${input({
          name: 'subject',
          label: 'Betreff',
          value: options.values.subject,
          error: errors.subject,
          maxlength: MAX_SUBJECT_LENGTH,
          required: true,
        })}
        ${textarea({
          name: 'body',
          label: 'Text',
          value: options.values.body,
          error: errors.body,
          maxlength: MAX_BODY_LENGTH,
          rows: 16,
          required: true,
        })}
        <p><button class="button" type="submit">Vorlage speichern</button></p>
      </form>

      <h2 class="section__title">Platzhalter</h2>
      <ul class="placeholders" role="list">
        ${PLACEHOLDERS.map(
          (placeholder) => html`<li><code>{${placeholder.name}}</code> ${placeholder.label}</li>`,
        )}
      </ul>

      <h2 class="section__title">Vorschau</h2>
      <p class="note">Mit Beispielwerten, so wie die Mail ankäme.</p>
      <div class="mail-preview">
        <p class="mail-preview__subject">${options.preview.subject}</p>
        <p class="mail-preview__body">${options.preview.body}</p>
      </div>

      ${options.isDefault
        ? ''
        : html`<form method="post" action="/admin/vorlage/zuruecksetzen">
            <button class="button button--small button--secondary" type="submit">
              Standardtext wiederherstellen
            </button>
          </form>`}
    </div>`
}
