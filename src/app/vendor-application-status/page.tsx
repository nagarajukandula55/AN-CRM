'use client'

import Link from 'next/link'
import { Clock } from 'lucide-react'
import { Card, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

export default function VendorApplicationStatusPage() {
  return (
    <div className="min-h-screen bg-bg text-ink flex items-center justify-center p-4">
      <Card className="max-w-md w-full text-center">
        <CardBody className="p-8">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warning-soft">
            <Clock className="h-6 w-6 text-warning" />
          </div>
          <h1 className="h-section mt-4">Your application is under review</h1>
          <p className="mt-2 text-sm text-ink-2">
            Your account is active, but vendor/business access is still pending admin
            approval. You&apos;ll get an email the moment your partner login and dashboard
            are ready — or, if instant activation is enabled for your business, your
            trial should begin shortly. Check back here or refresh once you&apos;ve received
            that email.
          </p>
          <Link href="/" className="inline-block mt-6">
            <Button variant="secondary">Back to Home</Button>
          </Link>
        </CardBody>
      </Card>
    </div>
  )
}
