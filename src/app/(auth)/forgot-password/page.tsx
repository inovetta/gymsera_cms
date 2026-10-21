'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Zap, ArrowLeft, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { authApi } from '@/lib/api/auth'

const schema = z.object({
  email: z.string().email('Please enter a valid email address'),
})

const resetSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your email'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type ForgotPasswordForm = z.infer<typeof schema>
type ResetForm = z.infer<typeof resetSchema>

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  const form = useForm<ForgotPasswordForm>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  })

  const resetForm = useForm<ResetForm>({
    resolver: zodResolver(resetSchema),
    defaultValues: { code: '', password: '', confirmPassword: '' },
  })

  const onSubmit = async (values: ForgotPasswordForm) => {
    setLoading(true)
    setError(null)
    try {
      await authApi.requestPasswordReset(values)
      setEmail(values.email)
    } catch {
      setError('Failed to send the reset code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const onConfirm = async (values: ResetForm) => {
    if (!email) return
    setLoading(true)
    setError(null)
    try {
      await authApi.confirmPasswordReset({ email, code: values.code, password: values.password })
      setDone(true)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      setError(e.response?.data?.message || 'Could not reset the password. Check the code and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md animate-fade-in">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/30">
            <Zap className="h-6 w-6 text-white" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-white">GymsEra</h1>
        <p className="text-slate-400 mt-1">Management Portal</p>
      </div>

      <Card className="shadow-2xl border-slate-700 bg-slate-800/80 backdrop-blur">
        <CardHeader className="space-y-1 pb-4">
          <CardTitle className="text-2xl text-white">Reset Password</CardTitle>
          <CardDescription className="text-slate-400">
            {email && !done ? `Enter the code sent to ${email} and choose a new password` : 'Enter your email to receive a password reset code'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {done ? (
            <div className="text-center py-4">
              <CheckCircle className="h-12 w-12 text-success mx-auto mb-4" />
              <p className="text-white font-medium">Password has been reset</p>
              <p className="text-slate-400 text-sm mt-2">
                You can now sign in with your new password.
              </p>
              <Link href="/login">
                <Button className="mt-6" variant="outline">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to login
                </Button>
              </Link>
            </div>
          ) : email ? (
            <>
              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Form {...resetForm}>
                <form onSubmit={resetForm.handleSubmit(onConfirm)} className="space-y-4">
                  {([
                    ['code', 'Reset code', 'text', '123456'],
                    ['password', 'New password', 'password', 'At least 8 characters'],
                    ['confirmPassword', 'Confirm new password', 'password', 'Repeat the new password'],
                  ] as const).map(([name, label, type, placeholder]) => (
                    <FormField
                      key={name}
                      control={resetForm.control}
                      name={name}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-slate-300">{label}</FormLabel>
                          <FormControl>
                            <Input
                              type={type}
                              placeholder={placeholder}
                              autoComplete={name === 'code' ? 'one-time-code' : 'new-password'}
                              className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 focus-visible:ring-primary"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                  <Button type="submit" className="w-full" loading={loading}>
                    Reset password
                  </Button>
                  <Button type="button" variant="ghost" className="w-full text-slate-400 hover:text-white" onClick={() => { setEmail(null); setError(null) }}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Use a different email
                  </Button>
                </form>
              </Form>
            </>
          ) : (
            <>
              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-300">Email address</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="admin@gymsera.com"
                            className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 focus-visible:ring-primary"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" loading={loading}>
                    Send reset code
                  </Button>
                  <Link href="/login" className="block">
                    <Button type="button" variant="ghost" className="w-full text-slate-400 hover:text-white">
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back to login
                    </Button>
                  </Link>
                </form>
              </Form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
