import { markShootDelivered } from "@/lib/actions/admin";

export function MarkDeliveredForm({
  clientId,
  shootId,
}: {
  clientId: string;
  shootId: string;
}) {
  return (
    <form action={markShootDelivered}>
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="shootId" value={shootId} />
      <button type="submit" className="text-sm text-white">
        Mark delivered
      </button>
    </form>
  );
}
