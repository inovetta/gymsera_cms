'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Flag, MessageSquare, Star } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { EmptyState } from '@/components/features/empty-state'
import { ErrorState } from '@/components/features/error-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { describeRequestError, plainRequestError } from '@/lib/api/request-errors'
import {
  ContentReport,
  MODERATION_QUEUE_KEY,
  MODERATION_WORDS_KEY,
  REPORT_ACTION_EFFECTS,
  REPORT_ACTION_LABELS,
  REPORT_REASON_LABELS,
  ReportAction,
  ReportStatus,
  ReportTargetType,
  moderationApi,
  parseWordList,
} from '@/lib/api/moderation'
import { formatDate } from '@/lib/utils'

/**
 * NEW-256 (App Store 1.2, Google Play UGC policy): Moderation › Reports and Moderation › Word list.
 * GymsEra platform admins handle reports here; target response time 24 hours (owner, 2026-11-16).
 */

const ageLabel = (hours: number) => (hours < 1 ? 'less than an hour' : hours < 48 ? `${hours} h` : `${Math.floor(hours / 24)} days`)

function ReportCard({ report }: { report: ContentReport }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<ReportAction | null>(null)
  const [note, setNote] = useState('')

  const act = useMutation({
    mutationFn: ({ action, adminNote }: { action: ReportAction; adminNote: string }) => moderationApi.act(report.id, action, adminNote),
    onSuccess: (res, vars) => {
      queryClient.invalidateQueries({ queryKey: MODERATION_QUEUE_KEY })
      const others = res?.data?.closedOthers ?? 0
      toast({
        title: `${REPORT_ACTION_LABELS[vars.action]}: done`,
        description: others > 0 ? `${others} other report${others === 1 ? '' : 's'} on the same item closed too.` : undefined,
      })
      setPending(null)
      setNote('')
    },
    onError: (err) =>
      toast({ title: 'Could not update the report', description: plainRequestError(err, 'Please try again.'), variant: 'destructive' }),
  })

  const isReview = report.targetType === 'REVIEW'
  return (
    <Card data-testid={`report-${report.id}`}>
      <CardContent className="p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1">
            {isReview ? <Star className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
            {isReview ? 'Review' : 'Chat message'}
          </Badge>
          <Badge variant="secondary">{REPORT_REASON_LABELS[report.reason] ?? report.reason}</Badge>
          {report.status === 'OPEN' ? (
            report.overdue ? (
              <Badge variant="destructive">Overdue · open {ageLabel(report.ageHours)}</Badge>
            ) : (
              <Badge variant="warning">Open {ageLabel(report.ageHours)}</Badge>
            )
          ) : (
            <Badge variant={report.status === 'ACTIONED' ? 'success' : 'outline'}>
              {report.status === 'ACTIONED' ? REPORT_ACTION_LABELS[report.action as ReportAction] ?? 'Actioned' : 'Dismissed'}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground ml-auto">{formatDate(report.createdAt)}</span>
        </div>

        <blockquote className="border-l-2 pl-3 text-sm whitespace-pre-wrap">
          {report.snapshotText || <span className="text-muted-foreground">(no text)</span>}
        </blockquote>

        <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
          <p>
            Author: <span className="text-foreground">{report.targetUser?.fullName ?? '—'}</span>
            {report.targetUser?.status === 'SUSPENDED' && <Badge variant="destructive" className="ml-2">Suspended</Badge>}
          </p>
          <p>Reported by: <span className="text-foreground">{report.reporter?.fullName ?? '—'}</span></p>
          {report.note && <p className="sm:col-span-2">Reporter&apos;s note: <span className="text-foreground">{report.note}</span></p>}
          {report.adminNote && <p className="sm:col-span-2">Admin note: <span className="text-foreground">{report.adminNote}</span></p>}
        </div>

        {report.allowedActions.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {report.allowedActions.map((a) => (
              <Button
                key={a}
                size="sm"
                variant={a === 'DISMISS' ? 'outline' : 'destructive'}
                onClick={() => setPending(a)}
                disabled={act.isPending}
              >
                {REPORT_ACTION_LABELS[a]}
              </Button>
            ))}
          </div>
        )}

        {pending && (
          <div className="rounded-md border p-3 space-y-2" role="group" aria-label="Confirm action">
            <p className="text-sm font-medium">{REPORT_ACTION_LABELS[pending]}?</p>
            <p className="text-xs text-muted-foreground">{REPORT_ACTION_EFFECTS[pending]}</p>
            <Textarea
              aria-label="Admin note (optional)"
              placeholder="Admin note (optional)"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => act.mutate({ action: pending, adminNote: note })} disabled={act.isPending}>
                {act.isPending ? 'Saving…' : `Confirm: ${REPORT_ACTION_LABELS[pending]}`}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPending(null)} disabled={act.isPending}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ReportsTab() {
  const [status, setStatus] = useState<ReportStatus | 'ALL'>('OPEN')
  const [type, setType] = useState<ReportTargetType | 'ALL'>('ALL')
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [...MODERATION_QUEUE_KEY, status, type],
    queryFn: () => moderationApi.getReports({ status, targetType: type === 'ALL' ? undefined : type, limit: 50 }),
  })
  const queue = data?.data
  const reports = queue?.reports ?? []

  return (
    <>
      {queue && (
        <p className="mb-4 text-sm" data-testid="report-counts">
          <span className="font-medium">{queue.counts.open} open</span>
          {queue.counts.overdue > 0 && (
            <span className="text-destructive font-medium"> · {queue.counts.overdue} overdue (older than {queue.responseHours} hours)</span>
          )}
          <span className="text-muted-foreground"> · Target: every report handled within {queue.responseHours} hours.</span>
        </p>
      )}
      <Card className="mb-6">
        <CardHeader className="pb-3 flex flex-row flex-wrap gap-3 items-center">
          <Tabs value={status} onValueChange={(v) => setStatus(v as ReportStatus | 'ALL')}>
            <TabsList>
              <TabsTrigger value="OPEN">Open</TabsTrigger>
              <TabsTrigger value="ACTIONED">Actioned</TabsTrigger>
              <TabsTrigger value="DISMISSED">Dismissed</TabsTrigger>
              <TabsTrigger value="ALL">All</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs value={type} onValueChange={(v) => setType(v as ReportTargetType | 'ALL')}>
            <TabsList>
              <TabsTrigger value="ALL">All content</TabsTrigger>
              <TabsTrigger value="REVIEW">Reviews</TabsTrigger>
              <TabsTrigger value="MESSAGE">Chat</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
      </Card>

      {isLoading ? (
        <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-lg" />)}</div>
      ) : error ? (
        <ErrorState error={error} what="the reports" onRetry={() => refetch()} />
      ) : reports.length === 0 ? (
        <EmptyState icon={Flag} title="No reports" description={status === 'OPEN' ? 'Nothing waiting. New reports appear here.' : 'No reports match these filters.'} />
      ) : (
        <div className="space-y-4">{reports.map((r) => <ReportCard key={r.id} report={r} />)}</div>
      )}
    </>
  )
}

function WordListTab() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: MODERATION_WORDS_KEY, queryFn: () => moderationApi.getWords() })
  const [text, setText] = useState('')
  const saved = data?.data?.words

  useEffect(() => {
    if (saved) setText(saved.join('\n'))
  }, [saved])

  const save = useMutation({
    mutationFn: () => moderationApi.saveWords(parseWordList(text)),
    onSuccess: (res) => {
      queryClient.setQueryData(MODERATION_WORDS_KEY, res)
      toast({ title: 'Word list saved', description: `${res?.data?.words?.length ?? 0} words. It applies to new messages and reviews at once.` })
    },
    // The server's own reason (e.g. which word is too short), not the generic validation copy.
    onError: (err) => toast({ title: 'Could not save the word list', description: describeRequestError(err, 'Please try again.'), variant: 'destructive' }),
  })

  if (isLoading) return <Skeleton className="h-64 rounded-lg" />
  if (error) return <ErrorState error={error} what="the word list" onRetry={() => refetch()} />

  const count = parseWordList(text).length
  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <p className="text-sm text-muted-foreground">
          One word or phrase per line. A chat message or review that contains one, as a whole word and in any
          letter case, is refused before it is sent, and the person is asked to change it.
        </p>
        <Textarea aria-label="Word list" rows={14} value={text} onChange={(e) => setText(e.target.value)} className="font-mono text-sm" />
        <div className="flex items-center gap-3">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save word list'}
          </Button>
          <span className="text-xs text-muted-foreground">{count} {count === 1 ? 'word' : 'words'}</span>
        </div>
      </CardContent>
    </Card>
  )
}

export default function ModerationPage() {
  const [tab, setTab] = useState<'reports' | 'words'>('reports')
  return (
    <>
      <Header title="Moderation" description="Reported reviews and chat messages" />
      <div className="p-6 animate-fade-in">
        <PageHeader title="Moderation" description="Reports from travellers and gyms, and the word filter" />
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'reports' | 'words')} className="mb-4">
          <TabsList>
            <TabsTrigger value="reports">Reports</TabsTrigger>
            <TabsTrigger value="words">Word list</TabsTrigger>
          </TabsList>
        </Tabs>
        {tab === 'reports' ? <ReportsTab /> : <WordListTab />}
      </div>
    </>
  )
}
