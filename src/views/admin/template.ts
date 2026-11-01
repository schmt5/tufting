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

  return html`<div class="page">
      <header class="detail__head">
        <div>
          <h1 class="page-title">E-Mail-Vorlage</h1>
          <p class="muted">
            Der Text für deine Antwort auf eine Anmeldung. „E-Mail schreiben“ bei einer Anmeldung öffnet
            deine Mail-App mit diesem Text, ausgefüllt für die Person. Du kannst ihn dort noch ändern.
          </p>
        </div>
      </header>
      ${options.isDefault ? html`<p class="alert">Noch der Standardtext — speichern macht ihn zu deinem.</p>` : ''}
      ${options.unknown.length > 0
        ? html`<p class="alert alert--warning">
            Diese Platzhalter gibt es nicht und bleiben so in der Mail stehen:
            ${options.unknown.map((name) => `{${name}}`).join(', ')}
          </p>`
        : ''}

      <div class="columns">
        <form class="form panel" method="post" action="/admin/vorlage">
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
          <div class="form__actions">
            <button class="button" type="submit">Vorlage speichern</button>
            ${options.isDefault
              ? ''
              : html`<button class="button button--ghost" type="submit" form="zuruecksetzen">
                  Standardtext wiederherstellen
                </button>`}
          </div>
        </form>

        <aside class="stack">
          <section class="panel">
            <h2 class="panel__title">Platzhalter</h2>
            <ul class="placeholders" role="list">
              ${PLACEHOLDERS.map(
                (placeholder) => html`<li><code>{${placeholder.name}}</code> ${placeholder.label}</li>`,
              )}
            </ul>
          </section>

          <section class="panel">
            <h2 class="panel__title">Vorschau</h2>
            <p class="muted">Mit Beispielwerten, so wie die Mail ankäme.</p>
            <div class="mail-preview">
              <p class="mail-preview__subject">${options.preview.subject}</p>
              <p class="mail-preview__body">${options.preview.body}</p>
            </div>
          </section>
        </aside>
      </div>

      <!-- Ausserhalb des Rasters, der Button oben verweist per form= darauf. -->
      ${options.isDefault ? '' : html`<form id="zuruecksetzen" method="post" action="/admin/vorlage/zuruecksetzen"></form>`}
    </div>`
}
