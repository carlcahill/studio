'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { SaloLogo } from '@/components/brand/salo-logo'
import { Switch } from '@/components/ui/switch'
import {
  approveSowByToken,
  getSowByToken,
  rejectSowByToken,
  type PublicSowDocument,
} from '@/app/actions/sow-public'
import {
  getRateMultiplier,
  scaleForQuote,
  formatSowMoney,
  lineTotalAtDayRate,
  computeSowTotalsAtDayRate,
  applySowDiscount,
  discountAmountGbp,
  parseDiscountPercent,
} from '@/lib/sow/calculations'
import { parseScopeNotes } from './scope-notes'

interface SowShareClientProps {
  shareToken: string
}

function formatDocumentDate(value: string | null | undefined): string {
  if (!value) return ''
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatDateRange(
  start: string | null | undefined,
  end: string | null | undefined
): string {
  const startLabel = start ? formatDocumentDate(start) : ''
  const endLabel = end ? formatDocumentDate(end) : ''
  if (startLabel && endLabel) return `${startLabel} to ${endLabel}`
  return startLabel || endLabel
}

function ThemeToggle() {
  const [choice, setChoice] = useState<'light' | 'dark' | null>(null)
  const [systemDark, setSystemDark] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    setSystemDark(media.matches)
    const onChange = () => setSystemDark(media.matches)
    media.addEventListener('change', onChange)
    try {
      const saved = localStorage.getItem('sow-theme')
      if (saved === 'light' || saved === 'dark') {
        setChoice(saved)
        document.documentElement.setAttribute('data-theme', saved)
      }
    } catch {
      // Ignore storage failures. The system setting still applies.
    }
    return () => {
      media.removeEventListener('change', onChange)
      document.documentElement.removeAttribute('data-theme')
    }
  }, [])

  function choose(next: 'light' | 'dark') {
    setChoice(next)
    document.documentElement.setAttribute('data-theme', next)
    try {
      localStorage.setItem('sow-theme', next)
    } catch {
      // The choice still applies for this visit.
    }
  }

  const active = choice ?? (systemDark ? 'dark' : 'light')

  return (
    <div className="sow-theme-toggle" role="group" aria-label="Colour theme">
      <button type="button" aria-pressed={active === 'light'} onClick={() => choose('light')}>
        Light
      </button>
      <button type="button" aria-pressed={active === 'dark'} onClick={() => choose('dark')}>
        Dark
      </button>
    </div>
  )
}

function ScopeAmendments({
  document,
}: {
  document: PublicSowDocument
}) {
  const amendments = document.scope_amendments ?? []
  if (amendments.length === 0) return null

  return (
    <div className="sow-section">
      <p className="sow-eyebrow">Deliverables updated after approval</p>
      {amendments.map((amendment) => (
        <p key={amendment.id} className="sow-body">
          {formatDocumentDate(amendment.created_at)}. {amendment.note}
        </p>
      ))}
    </div>
  )
}

export default function SowShareClient({ shareToken }: SowShareClientProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [document, setDocument] = useState<PublicSowDocument | null>(null)
  const [approverName, setApproverName] = useState('')
  const [approverEmail, setApproverEmail] = useState('')
  const [rejectionNotes, setRejectionNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [showWhiteLabelRates, setShowWhiteLabelRates] = useState(false)

  async function loadDocument() {
    setLoading(true)
    setError(null)
    const result = await getSowByToken(shareToken)
    setLoading(false)
    if (result.error) {
      setError(result.error)
      setDocument(null)
      return
    }
    if (result.document) setDocument(result.document)
  }

  useEffect(() => {
    loadDocument()
  }, [shareToken])

  async function handleApprove() {
    setSubmitting(true)
    const result = await approveSowByToken(shareToken, approverName, approverEmail)
    setSubmitting(false)
    if (result.error) {
      setError(result.error)
    } else {
      await loadDocument()
    }
  }

  async function handleReject() {
    setSubmitting(true)
    const result = await rejectSowByToken(shareToken, approverName, rejectionNotes)
    setSubmitting(false)
    if (result.error) {
      setError(result.error)
    } else {
      await loadDocument()
      setShowRejectForm(false)
    }
  }

  if (loading) {
    return (
      <div className="sow-document">
        <div className="sow-loading" role="status">
          <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
          <span className="sr-only">Loading statement of work</span>
        </div>
      </div>
    )
  }

  if (error && !document) {
    return (
      <div className="sow-document">
        <div className="sow-error-page">
          <p className="sow-eyebrow">Statement of work</p>
          <h1 className="sow-title">Unable to load</h1>
          <p className="sow-parties">{error}</p>
        </div>
      </div>
    )
  }

  if (!document) return null

  const isApproved = document.status === 'approved'
  const isComplete = document.status === 'complete'
  const isRejected = document.status === 'rejected'
  const canRespond = !isApproved && !isRejected && !isComplete
  const showQuotedHours = document.show_quoted_hours ?? true
  const showPaymentSchedule = document.show_payment_schedule ?? true
  const currency = document.currency === 'USD' ? 'USD' : 'GBP'
  const fxRate = currency === 'GBP' ? 1 : Number(document.fx_rate) > 0 ? Number(document.fx_rate) : 1
  const money = (amountGbp: number) => formatSowMoney(amountGbp, currency, fxRate)
  const canViewWhiteLabel =
    document.customer_type === 'partner' &&
    Boolean(document.allow_white_label_view) &&
    Number(document.white_label_day_rate_gbp) > 0
  const viewingWhiteLabel = canViewWhiteLabel && showWhiteLabelRates
  const whiteLabelDayRate = Number(document.white_label_day_rate_gbp) || 0
  const hoursPerDay = Number(document.hours_per_day) || 6
  const whiteLabelTotals = viewingWhiteLabel
    ? computeSowTotalsAtDayRate(
        document.line_items,
        document.include_vat,
        hoursPerDay,
        whiteLabelDayRate
      )
    : null
  const rateMultiplier = viewingWhiteLabel
    ? 1
    : getRateMultiplier(
        Number(document.base_day_rate_gbp) || 0,
        document.day_rate_override_gbp != null ? Number(document.day_rate_override_gbp) : null
      )
  const displayTotalHours = viewingWhiteLabel
    ? whiteLabelTotals?.total_hours ?? 0
    : document.line_items.reduce(
        (sum, item) => sum + scaleForQuote(Number(item.hours), rateMultiplier),
        0
      )
  const grossSubtotal = whiteLabelTotals
    ? whiteLabelTotals.subtotal_gbp
    : Number(document.subtotal_gbp)
  const discountPercent = parseDiscountPercent(document.discount_percent).percent
  const priced = applySowDiscount(
    {
      subtotal_gbp: grossSubtotal,
      vat_amount_gbp: 0,
      total_gbp: 0,
      total_hours: displayTotalHours,
    },
    discountPercent,
    document.include_vat
  )
  const displaySubtotal = priced.subtotal_gbp
  const displayDiscount = discountAmountGbp(displaySubtotal, discountPercent)
  const displayVat = priced.vat_amount_gbp
  const displayTotal = priced.total_gbp
  const scopeSections = document.notes ? parseScopeNotes(document.notes) : []
  const nameMissing = !approverName.trim()

  return (
    <div className="sow-document">
      <article className="sow-sheet">
        <header>
          <div className="sow-header-bar">
            <SaloLogo className="sow-logo" />
            <ThemeToggle />
          </div>
          <p className="sow-eyebrow">Statement of Work</p>
          <h1 className="sow-title">{document.title}</h1>
          <p className="sow-parties">
            {document.agency_name
              ? `Agency partner: ${document.agency_name} · End client: ${document.client_name}`
              : document.client_name}
          </p>
        </header>

        {isApproved && (
          <section className="sow-status">
            <p className="sow-eyebrow">Approved</p>
            <p className="sow-body">
              {document.approved_by_name} approved this
              {document.approved_at ? ` on ${formatDocumentDate(document.approved_at)}` : ''}
            </p>
            <ScopeAmendments document={document} />
          </section>
        )}

        {isComplete && (
          <section className="sow-status">
            <p className="sow-eyebrow">Complete</p>
            <p className="sow-body">Work on this statement of work is finished</p>
            <ScopeAmendments document={document} />
          </section>
        )}

        {isRejected && (
          <section className="sow-status">
            <p className="sow-eyebrow">Declined</p>
            <p className="sow-body">
              {document.rejected_by_name} declined
              {document.rejected_at ? ` on ${formatDocumentDate(document.rejected_at)}` : ''}
            </p>
            {document.rejection_notes && <p className="sow-body">{document.rejection_notes}</p>}
          </section>
        )}

        {scopeSections.length > 0 && (
          <section className="sow-panel" aria-label="Scope">
            {scopeSections.map((section) => (
              <div key={section.label} className="sow-section">
                <h2 className="sow-eyebrow">{section.label}</h2>
                {section.note && <p className="sow-note">{section.note}</p>}
                {section.items.length > 0 && (
                  <ol>
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ol>
                )}
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph} className="sow-body">
                    {paragraph}
                  </p>
                ))}
              </div>
            ))}
          </section>
        )}

        {(document.start_date || document.end_date) && (
          <div className="sow-dates">
            {document.start_date && (
              <div className="sow-date">
                <p className="sow-eyebrow">Project start</p>
                <p>{formatDocumentDate(document.start_date)}</p>
              </div>
            )}
            {document.end_date && (
              <div className="sow-date">
                <p className="sow-eyebrow">Project end</p>
                <p>{formatDocumentDate(document.end_date)}</p>
              </div>
            )}
          </div>
        )}

        {canViewWhiteLabel && (
          <div className="sow-rates">
            <div>
              <label htmlFor="sow-white-label-view">Show white-label rates</label>
              <p>
                {showWhiteLabelRates
                  ? 'Figures use Salo’s direct client day rate'
                  : 'Figures currently use the partner rate'}
              </p>
            </div>
            <Switch
              id="sow-white-label-view"
              checked={showWhiteLabelRates}
              onCheckedChange={setShowWhiteLabelRates}
            />
          </div>
        )}

        <section className="sow-block" aria-label="Deliverables">
          <h2 className="sow-eyebrow">Deliverables</h2>
          {document.line_items.map((item) => {
            const hoursLabel = item.is_days
              ? `${scaleForQuote(Number(item.quantity), rateMultiplier)} day${
                  scaleForQuote(Number(item.quantity), rateMultiplier) !== 1 ? 's' : ''
                } (${scaleForQuote(Number(item.hours), rateMultiplier).toFixed(1)}h)`
              : `${scaleForQuote(Number(item.hours), rateMultiplier).toFixed(1)}h`
            const range = formatDateRange(item.timeline_start, item.timeline_end)
            return (
              <div key={item.id} className="sow-row">
                <div>
                  <h3>{item.title}</h3>
                  {item.description && <p className="sow-body">{item.description}</p>}
                  {(range || showQuotedHours) && (
                    <p className="sow-meta">
                      {showQuotedHours ? hoursLabel : ''}
                      {showQuotedHours && range ? ' · ' : ''}
                      {range}
                    </p>
                  )}
                </div>
                <p className="sow-cost">
                  {money(
                    viewingWhiteLabel
                      ? lineTotalAtDayRate(Number(item.hours), hoursPerDay, whiteLabelDayRate)
                      : Number(item.line_total_gbp)
                  )}
                </p>
              </div>
            )
          })}

          <div className="sow-totals">
            {currency !== 'GBP' && (
              <p className="sow-meta">Amounts in USD (rate £1 = ${Number(fxRate).toFixed(4)})</p>
            )}
            <div className="sow-total-line">
              <span>Subtotal</span>
              <span>{money(displaySubtotal)}</span>
            </div>
            {displayDiscount > 0 && discountPercent != null && (
              <div className="sow-total-line">
                <span>Discount ({discountPercent}%)</span>
                <span>−{money(displayDiscount)}</span>
              </div>
            )}
            {document.include_vat && (
              <div className="sow-total-line">
                <span>VAT (20%)</span>
                <span>{money(displayVat)}</span>
              </div>
            )}
            <div className="sow-total-line sow-grand">
              <strong>Total</strong>
              <strong>{money(displayTotal)}</strong>
            </div>
            {showQuotedHours && (
              <div className="sow-total-line">
                <span>Total hours</span>
                <span>{displayTotalHours.toFixed(1)}h</span>
              </div>
            )}
          </div>
        </section>

        {showPaymentSchedule && (document.payment_milestones?.length ?? 0) > 0 && (
          <section className="sow-block" aria-label="Payment schedule">
            <h2 className="sow-eyebrow">Payment schedule</h2>
            {document.payment_milestones!.map((milestone) => {
              const amount = (displayTotal * Number(milestone.percentage)) / 100
              return (
                <div key={milestone.id} className="sow-milestone">
                  <div>
                    <p>{milestone.label}</p>
                    <p className="sow-meta">
                      {Number(milestone.percentage).toFixed(0)}%
                      {milestone.due_date
                        ? ` · due ${formatDocumentDate(milestone.due_date)}`
                        : ''}
                    </p>
                  </div>
                  <p className="sow-amount">{money(amount)}</p>
                </div>
              )
            })}
          </section>
        )}

        {canRespond && (
          <section className="sow-card sow-response">
            <h2 className="sow-eyebrow">Your response</h2>
            <p className="sow-body">
              Approve this statement of work to confirm scope and investment, or decline with feedback.
            </p>
            {error && <p className="sow-error">{error}</p>}
            <div className="sow-fields sow-following">
              <div className="sow-field">
                <label htmlFor="approver-name">Your name</label>
                <input
                  id="approver-name"
                  value={approverName}
                  onChange={(event) => setApproverName(event.target.value)}
                  placeholder="Full name"
                  autoComplete="name"
                />
              </div>
              <div className="sow-field">
                <label htmlFor="approver-email">Email (optional)</label>
                <input
                  id="approver-email"
                  type="email"
                  value={approverEmail}
                  onChange={(event) => setApproverEmail(event.target.value)}
                  placeholder="you@company.com"
                  autoComplete="email"
                />
              </div>
            </div>

            {showRejectForm && (
              <div className="sow-field sow-following">
                <label htmlFor="rejection-notes">Feedback (optional)</label>
                <textarea
                  id="rejection-notes"
                  value={rejectionNotes}
                  onChange={(event) => setRejectionNotes(event.target.value)}
                  placeholder="Let us know what needs changing"
                  rows={3}
                />
              </div>
            )}

            <div className="sow-actions">
              {!showRejectForm ? (
                <>
                  <button
                    type="button"
                    className="sow-button sow-button-secondary"
                    onClick={() => setShowRejectForm(true)}
                    disabled={submitting}
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    className="sow-button sow-button-primary"
                    onClick={handleApprove}
                    disabled={submitting || nameMissing}
                  >
                    {submitting ? 'Approving' : 'Approve statement of work'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="sow-button sow-button-secondary"
                    onClick={() => {
                      setShowRejectForm(false)
                      setRejectionNotes('')
                    }}
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="sow-button sow-button-secondary"
                    onClick={handleReject}
                    disabled={submitting || nameMissing}
                  >
                    {submitting ? 'Sending' : 'Confirm decline'}
                  </button>
                </>
              )}
            </div>
          </section>
        )}

        <footer className="sow-footer">
          Salo Creative · <a href="https://salo.uk">salo.uk</a>
        </footer>
      </article>
    </div>
  )
}
