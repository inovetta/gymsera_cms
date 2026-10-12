import { Rocket } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

/**
 * Boost is not on sale yet (decision R-15): a card that says so. No button, no payment, no
 * success state. It is `aria-disabled` so assistive technology reads it as unavailable.
 */
export function BoostCard() {
  return (
    <Card data-testid="section-boost" aria-disabled="true" className="border-dashed bg-muted/40 opacity-80">
      <div className="flex items-center gap-3 p-4">
        <Rocket className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Boost this listing</h3>
            <Badge variant="secondary">COMING SOON</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Promote this branch to more travelers. We will let you know when it is available.
          </p>
        </div>
      </div>
    </Card>
  )
}
