'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
   Tooltip,
   TooltipContent,
   TooltipProvider,
   TooltipTrigger,
} from '@/components/ui/tooltip'
import { Check, File, FileText, Target, Trash2, X } from 'lucide-react'
import type { JobAnalysis } from '@/lib/db/schema'
import { AddDocumentDialog } from './add-document-dialog'

export interface DocumentSummary {
   id: number
   name: string
   docType: 'resume' | 'job'
   chunkCount: number
   sizeBytes: number
   createdAt: string
   analysis?: JobAnalysis | null
}

// The retrieval corpus, visible at a glance on the right of the chat —
// résumé on top, jobs ranked by their ingest-time fit screen (match score,
// screening risk, seniority fit). Rows carry a hover-revealed delete;
// adding documents lives in the chat input (📎).
export function ContextPanel({
   documents,
   loading,
   onDocumentsChanged,
   onPrep,
}: {
   documents: DocumentSummary[]
   loading: boolean
   onDocumentsChanged: () => void
   /** Routes to the chat: scope to this job and ask the interview-prep question. */
   onPrep: (doc: DocumentSummary) => void
}) {
   const [toDelete, setToDelete] = useState<DocumentSummary | null>(null)
   const [deleting, setDeleting] = useState(false)
   const resumes = documents.filter(d => d.docType === 'resume')
   const jobs = documents.filter(d => d.docType === 'job')

   async function confirmDelete() {
      if (!toDelete || deleting) return
      setDeleting(true)
      try {
         const res = await fetch(`/api/documents/${toDelete.id}`, {
            method: 'DELETE',
         })
         const data = await res.json()
         if (!res.ok)
            throw new Error(data.error ?? `Delete failed (${res.status})`)
         toast.success(`${toDelete.name} removed from the corpus`)
         setToDelete(null)
         onDocumentsChanged()
      } catch (err) {
         toast.error(err instanceof Error ? err.message : 'Delete failed')
      } finally {
         setDeleting(false)
      }
   }

   return (
      <aside className='hidden w-80 shrink-0 flex-col border-l bg-muted/30 lg:flex'>
         <div className='flex items-center justify-between px-4 pb-2 pt-4'>
            <h2 className='text-sm font-semibold'>Context</h2>
            <div className='flex items-center gap-1'>
               <Badge variant='default' className='text-[11px]'>
                  {documents.length} file{documents.length === 1 ? '' : 's'}
               </Badge>
               {/* Same dialog as the chat input's 📎 — a second entry point
                   where the corpus is actually looked at. */}
               <AddDocumentDialog onAdded={onDocumentsChanged} />
            </div>
         </div>
         <ScrollArea className='min-h-0 flex-1 px-2 py-2'>
            {loading ? (
               <div className='space-y-2 px-2'>
                  <Skeleton className='h-10 w-full' />
                  <Skeleton className='h-10 w-full' />
                  <Skeleton className='h-10 w-full' />
               </div>
            ) : documents.length === 0 ? (
               <p className='px-2 text-xs text-muted-foreground'>
                  No documents yet. Run{' '}
                  <code className='rounded bg-muted px-1 font-mono'>
                     pnpm seed
                  </code>{' '}
                  for the demo corpus, or attach a file with the 📎 in the chat
                  box.
               </p>
            ) : (
               <div className='space-y-5'>
                  <section>
                     <SectionHeading>Résumé</SectionHeading>
                     <DocList docs={resumes} onDelete={setToDelete} onPrep={onPrep} />
                  </section>
                  <section>
                     <SectionHeading
                        hint={jobs.length > 1 ? 'best match first' : undefined}>
                        Jobs
                     </SectionHeading>
                     <DocList docs={jobs} onDelete={setToDelete} onPrep={onPrep} />
                  </section>
               </div>
            )}
         </ScrollArea>

         <AlertDialog
            open={toDelete !== null}
            onOpenChange={open => !open && setToDelete(null)}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Remove {toDelete?.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                     This deletes its {toDelete?.chunkCount} embedded chunk
                     {toDelete?.chunkCount === 1 ? '' : 's'} from the corpus, so
                     future answers will no longer consider it. It cannot be
                     undone — you can re-upload the file later.
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleting}>
                     Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                     onClick={confirmDelete}
                     disabled={deleting}
                     variant='destructive'>
                     {deleting ? 'Removing…' : 'Remove'}
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </aside>
   )
}

function SectionHeading({
   children,
   hint,
}: {
   children: React.ReactNode
   hint?: string
}) {
   return (
      <div className='mb-1 flex items-baseline justify-between px-2'>
         <h3 className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
            {children}
         </h3>
         {hint && (
            <span className='text-[10px] text-muted-foreground'>{hint}</span>
         )}
      </div>
   )
}

function DocList({
   docs,
   onDelete,
   onPrep,
}: {
   docs: DocumentSummary[]
   onDelete: (doc: DocumentSummary) => void
   onPrep: (doc: DocumentSummary) => void
}) {
   if (docs.length === 0) {
      return <p className='px-2 text-xs text-muted-foreground'>None yet.</p>
   }
   return (
      <ul className='space-y-1'>
         {docs.map(doc => (
            <li
               key={doc.id}
               className='group flex items-start gap-3 rounded-md px-2 py-2'>
               <DocIcon name={doc.name} />
               <div className='min-w-0 flex-1'>
                  <p className='truncate text-xs font-normal' title={doc.name}>
                     
                     {doc.name}
                  </p>
                  <div className='flex flex-wrap  items-start gap-x-1.5 gap-y-.5 text-[10px] text-muted-foreground'>
                     {doc.analysis && (
                        <MatchStats
                           analysis={doc.analysis}
                           onPrep={() => onPrep(doc)}
                        />
                     )}
                  </div>
               </div>
               <Button
                  variant='ghost'
                  size='icon-sm'
                  className='invisible size-6 shrink-0 text-muted-foreground hover:text-destructive group-hover:visible'
                  onClick={() => onDelete(doc)}
                  aria-label={`Delete ${doc.name}`}>
                  <Trash2 className='size-3.5' />
               </Button>
            </li>
         ))}
      </ul>
   )
}

// green ≥70 / amber 40–69 / red <40 — coarse on purpose; the number carries
// the precision. Faded (/55) so the dot whispers like the tinted badges
// instead of being the loudest pixel in a mono theme.
function scoreColor(score: number): string {
   if (score >= 70) return 'bg-green-500/55'
   if (score >= 40) return 'bg-amber-500/55'
   return 'bg-red-500/55'
}

// Skill gaps = must-haves the résumé doesn't evidence (total − met).
// null when the analysis predates the mustHaves field.
function gapCount(analysis: JobAnalysis): number | null {
   const match = analysis.mustHaves?.match(/^(\d+)\/(\d+)$/)
   if (!match) return null
   return Math.max(0, Number(match[2]) - Number(match[1]))
}

// Subtle tint only — the mono theme keeps color to a whisper.
function gapClasses(gaps: number): string {
   if (gaps === 0)
      return 'border-green-200/70 text-green-700 dark:border-green-900 dark:text-green-500'
   if (gaps <= 2)
      return 'border-amber-200/70 text-amber-700 dark:border-amber-900 dark:text-amber-500'
   return 'border-red-200/70 text-red-700 dark:border-red-900 dark:text-red-500'
}

const SENIORITY_TOOLTIP = {
   fit: 'Experience alignment — fit for the level this role is pitched at',
   under: 'Experience alignment — under-qualified for the level this role is pitched at',
   over: 'Experience alignment — over-qualified for the level this role is pitched at',
}

const VERDICT_CLASSES = {
   yes: 'border-green-200/70 text-green-700 dark:border-green-900 dark:text-green-500',
   no: 'border-red-200/70 text-red-700 dark:border-red-900 dark:text-red-500',
}

// The three metrics — fit, skill gaps, experience alignment. Each carries its
// own tooltip; the recruiter-lens risk sentence lives in the gaps tooltip.
function MatchStats({
   analysis,
   onPrep,
}: {
   analysis: JobAnalysis
   onPrep: () => void
}) {
   const gaps = gapCount(analysis)
   return (
      <TooltipProvider>
         {/* Fixed-width columns (fit | gaps | seniority | verdict | prep) so
            values line up vertically across rows — absent values keep their
            cell instead of letting the row reflow. */}
         <span className='inline-grid grid-cols-[4rem_2.9rem_2.6rem_2.4rem_1.4rem] items-center justify-items-start gap-x-1'>
            <Tooltip>
               <TooltipTrigger
                  render={
                     <span className='flex cursor-default items-center gap-1 text-[10px] font-normal tabular-nums text-muted-foreground' />
                  }>
                  <span
                     className={`size-2 rounded-full ${scoreColor(analysis.matchScore)}`}
                     aria-hidden
                  />
                  {analysis.matchScore}% fit
               </TooltipTrigger>
               <TooltipContent>
                  Fit — overall skills &amp; experience match for this role
                  (median of 3 screens)
               </TooltipContent>
            </Tooltip>
            {gaps === null ? (
               <span aria-hidden />
            ) : (
               <Tooltip>
                  <TooltipTrigger
                     render={
                        <Badge
                           variant='outline'
                           className={`cursor-default px-1.5 text-[10px] font-normal ${gapClasses(gaps)} text-muted-foreground`}
                        />
                     }>
                     {gaps} gap{gaps === 1 ? '' : 's'}
                  </TooltipTrigger>
                  <TooltipContent className='max-w-64 flex-col items-start'>
                     <p>
                        Skill gaps — must-haves evidenced: {analysis.mustHaves}
                     </p>
                     {analysis.missing && analysis.missing.length > 0 ? (
                        <ul className='mt-1 list-disc pl-4'>
                           {analysis.missing.map(m => (
                              <li key={m}>{m}</li>
                           ))}
                        </ul>
                     ) : analysis.riskNote ? (
                        <p className='mt-1'>{analysis.riskNote}</p>
                     ) : null}
                  </TooltipContent>
               </Tooltip>
            )}
            {/* Seniority only speaks when it's a warning — "fit" is implied
               by the verdict, so the old ✓ was redundant. */}
            {analysis.seniority === 'fit' ? (
               <span aria-hidden />
            ) : (
               <Tooltip>
                  <TooltipTrigger
                     render={
                        <Badge
                           variant='outline'
                           className='cursor-default px-1.5 text-[10px] font-normal text-muted-foreground'
                        />
                     }>
                     {analysis.seniority}
                  </TooltipTrigger>
                  <TooltipContent>
                     {SENIORITY_TOOLTIP[analysis.seniority]}
                  </TooltipContent>
               </Tooltip>
            )}
            {!analysis.apply ? (
               <span aria-hidden />
            ) : (
               <Tooltip>
                  <TooltipTrigger
                     render={
                        <Badge
                           variant='outline'
                           className={`cursor-default px-1.5 text-[10px] font-normal text-muted-foreground`}
                        />
                     }>
                     {analysis.apply === 'yes' ? (
                        <>
                              {/* <Check className='size-3' strokeWidth={2.5} /> */}
                              Yes
                        </>
                     ) : (
                        <>
                           {' '}
                                 {/* <X className='size-3' strokeWidth={2.5} /> */}
                                 No
                        </>
                     )}
                  </TooltipTrigger>
                  <TooltipContent className='max-w-60'>
                     Verdict —{' '}
                     {analysis.apply === 'yes'
                        ? 'worth applying as-is: realistic chance despite any gaps'
                        : 'not worth applying as-is: close the key gaps first'}
                  </TooltipContent>
               </Tooltip>
            )}
            {/* Prep routes to the chat (scoped to this job) — the chat is
                the answer surface; the panel only launches the question. */}
            {analysis.apply === 'yes' ? (
               <Tooltip>
                  <TooltipTrigger
                     render={
                        <Button
                           variant='ghost'
                           size='icon-sm'
                           className='size-5 text-muted-foreground hover:text-foreground'
                           onClick={onPrep}
                           aria-label='Prepare for this interview in chat'
                        />
                     }>
                     <Target className='size-3.5' />
                  </TooltipTrigger>
                  <TooltipContent>
                     Interview prep — asks the chat, scoped to this job
                  </TooltipContent>
               </Tooltip>
            ) : (
               <span aria-hidden />
            )}
         </span>
      </TooltipProvider>
   )
}

function DocIcon({ name }: { name: string }) {
   const Icon = /\.pdf$/i.test(name) ? File : FileText
   return <Icon className='mt-0.5 size-4 shrink-0 text-muted-foreground' />
}

function formatSize(bytes: number): string {
   if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
   if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
   return `${bytes} B`
}

// Time of day for today's uploads, date otherwise — matches how little the
// exact timestamp matters at this scale.
function formatWhen(iso: string): string {
   const date = new Date(iso)
   const today = new Date().toDateString() === date.toDateString()
   return today
      ? date.toLocaleTimeString(undefined, {
           hour: 'numeric',
           minute: '2-digit',
        })
      : date.toLocaleDateString()
}
