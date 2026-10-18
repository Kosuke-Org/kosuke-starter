import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useSession } from "@/lib/auth-client";

export const Route = createFileRoute("/")({ component: Home });

type AppRecord = { id: string; data: Record<string, unknown> };

/** What a record shows: its `text` field, or its whole data when it has none. */
const label = (record: AppRecord) =>
  typeof record.data.text === "string" ? record.data.text : JSON.stringify(record.data);

async function fail(res: { json(): Promise<unknown> }, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  throw new Error(body?.error ?? fallback);
}

function Home() {
  const { data: session, isPending } = useSession();
  if (isPending) return <Skeleton className="mx-auto h-48 w-full max-w-lg" aria-label="Loading" />;
  // Records are for signed-in users (worker/routes/records.ts).
  if (!session) return <Navigate to="/sign-in" replace />;
  return <Records userId={session.user.id} />;
}

function Records({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["records", userId];
  const [text, setText] = useState("");
  const records = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await api.api.records.$get();
      if (!res.ok) return fail(res, "Could not load the records");
      return res.json();
    },
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const add = useMutation({
    mutationFn: async (value: string) => {
      const res = await api.api.records.$post({ json: { data: { text: value } } });
      if (!res.ok) return fail(res, "Could not add the record");
      return res.json();
    },
    onSuccess: () => {
      setText("");
      return refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (text.trim()) add.mutate(text.trim());
  }

  return (
    <Card className="mx-auto w-full max-w-lg">
      <CardHeader>
        <CardTitle>Records</CardTitle>
        <CardDescription>The app's data, shared by everyone signed in and by the app's Crons.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={onSubmit} className="flex gap-2">
          <Input
            name="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write a record"
            aria-label="New record"
          />
          <Button type="submit" disabled={add.isPending || !text.trim()}>
            Add
          </Button>
        </form>
        {records.isPending ? (
          <div className="flex flex-col gap-2" aria-label="Loading records">
            <Skeleton className="h-9 w-2/3" />
            <Skeleton className="h-9 w-1/2" />
          </div>
        ) : records.isError ? (
          <p className="text-sm text-destructive">{records.error.message}</p>
        ) : records.data.length ? (
          <ul className="flex flex-col gap-2 text-sm">
            {records.data.map((record) => (
              <RecordItem key={record.id} record={record} onChanged={refresh} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No records yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

function RecordItem({ record, onChanged }: { record: AppRecord; onChanged: () => Promise<void> }) {
  const [draft, setDraft] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async (value: string) => {
      const res = await api.api.records[":id"].$patch({ param: { id: record.id }, json: { data: { text: value } } });
      if (!res.ok) return fail(res, "Could not save the record");
    },
    onSuccess: async () => {
      await onChanged();
      setDraft(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async () => {
      const res = await api.api.records[":id"].$delete({ param: { id: record.id } });
      if (!res.ok) return fail(res, "Could not delete the record");
    },
    onSuccess: onChanged,
    onError: (e) => toast.error(e.message),
  });

  if (draft !== null) {
    return (
      <li>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) save.mutate(draft.trim());
          }}
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setDraft(null)}
            aria-label="Record text"
            autoFocus
          />
          <Button type="submit" size="icon" aria-label="Save" disabled={save.isPending || !draft.trim()}>
            <Check />
          </Button>
          <Button type="button" size="icon" variant="ghost" aria-label="Cancel" onClick={() => setDraft(null)}>
            <X />
          </Button>
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2 rounded-md border py-1 pr-1 pl-3">
      <span className="flex-1 break-words">{label(record)}</span>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Edit"
        onClick={() => setDraft(typeof record.data.text === "string" ? record.data.text : "")}
      >
        <Pencil />
      </Button>
      <Button size="icon" variant="ghost" aria-label="Delete" disabled={remove.isPending} onClick={() => remove.mutate()}>
        <Trash2 />
      </Button>
    </li>
  );
}
