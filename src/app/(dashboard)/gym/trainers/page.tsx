'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Dumbbell, Star, MoreHorizontal } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { StatusBadge } from '@/components/features/status-badge'
import { EmptyState } from '@/components/features/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { trainersApi } from '@/lib/api/trainers'
import { Trainer } from '@/types'
import { getInitials } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

const trainerSchema = z.object({
  email: z.string().email('Valid email required'),
  specialization: z.string().min(2, 'Specialization required'),
  bio: z.string().optional(),
  yearsExperience: z.coerce.number().min(0),
})

type TrainerForm = z.infer<typeof trainerSchema>

function TrainerCard({ trainer, onEdit, onToggle }: {
  trainer: Trainer
  onEdit: (t: Trainer) => void
  onToggle: (t: Trainer) => void
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarImage src={trainer.user?.profileImageUrl} />
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {trainer.user?.fullName ? getInitials(trainer.user.fullName) : 'T'}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold">{trainer.user?.fullName ?? '—'}</p>
              <p className="text-sm text-muted-foreground">{trainer.user?.email}</p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(trainer)}>Edit</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onToggle(trainer)}>
                {trainer.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Dumbbell className="h-4 w-4 text-primary" />
            <span className="font-medium">{trainer.specialization}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Star className="h-4 w-4" />
            <span>{trainer.yearsExperience} years experience</span>
          </div>
          {trainer.bio && <p className="text-sm text-muted-foreground line-clamp-2">{trainer.bio}</p>}
        </div>

        {trainer.certifications && trainer.certifications.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {trainer.certifications.map((cert) => (
              <span key={cert} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{cert}</span>
            ))}
          </div>
        )}

        <div className="mt-3">
          <StatusBadge status={trainer.status} />
        </div>
      </CardContent>
    </Card>
  )
}

export default function TrainersPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTrainer, setEditTrainer] = useState<Trainer | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['trainers'],
    queryFn: () => trainersApi.getTrainers(),
  })

  const form = useForm<TrainerForm>({
    resolver: zodResolver(trainerSchema),
    defaultValues: { email: '', specialization: '', bio: '', yearsExperience: 0 },
  })

  const createMutation = useMutation({
    mutationFn: (payload: TrainerForm) => trainersApi.createTrainer(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainers'] })
      setDialogOpen(false)
      form.reset()
      toast({ title: 'Trainer added successfully' })
    },
    onError: () => toast({ title: 'Error', description: 'Failed to add trainer', variant: 'destructive' }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<TrainerForm> }) =>
      trainersApi.updateTrainer(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainers'] })
      setDialogOpen(false)
      setEditTrainer(null)
      toast({ title: 'Trainer updated' })
    },
  })

  const toggleMutation = useMutation({
    mutationFn: (id: string) => trainersApi.toggleTrainerStatus(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainers'] })
      toast({ title: 'Trainer status updated' })
    },
  })

  const openCreate = () => {
    setEditTrainer(null)
    form.reset({ email: '', specialization: '', bio: '', yearsExperience: 0 })
    setDialogOpen(true)
  }

  const openEdit = (trainer: Trainer) => {
    setEditTrainer(trainer)
    form.reset({
      email: trainer.user?.email || '',
      specialization: trainer.specialization,
      bio: trainer.bio || '',
      yearsExperience: trainer.yearsExperience,
    })
    setDialogOpen(true)
  }

  const onSubmit = (values: TrainerForm) => {
    if (editTrainer) {
      updateMutation.mutate({ id: editTrainer.id, payload: values })
    } else {
      createMutation.mutate(values)
    }
  }

  const trainers = data?.data?.trainers ?? []

  return (
    <>
      <Header title="Trainers" description="Manage your gym's training staff" />
      <div className="p-6 animate-fade-in">
        <PageHeader
          title="Trainers"
          description={`${trainers.length} trainer${trainers.length !== 1 ? 's' : ''}`}
          action={<Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Add Trainer</Button>}
        />

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-56 rounded-lg" />)}
          </div>
        ) : trainers.length === 0 ? (
          <EmptyState
            icon={Dumbbell}
            title="No trainers yet"
            description="Add trainers to your gym staff"
            action={<Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Add Trainer</Button>}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {trainers.map((trainer) => (
              <TrainerCard
                key={trainer.id}
                trainer={trainer}
                onEdit={openEdit}
                onToggle={(t) => toggleMutation.mutate(t.id)}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTrainer ? 'Edit Trainer' : 'Add Trainer'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {!editTrainer && (
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Trainer Email *</FormLabel>
                      <FormControl><Input type="email" placeholder="trainer@example.com" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name="specialization"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Specialization *</FormLabel>
                    <FormControl><Input placeholder="CrossFit, Yoga, Weightlifting..." {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="yearsExperience"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Years of Experience</FormLabel>
                    <FormControl><Input type="number" min="0" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bio</FormLabel>
                    <FormControl><Textarea placeholder="Trainer biography..." rows={3} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>
                  {editTrainer ? 'Save Changes' : 'Add Trainer'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  )
}
