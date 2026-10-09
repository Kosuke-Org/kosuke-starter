import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const notes = useQuery({
    queryKey: ["notes"],
    queryFn: async () => (await api.api.notes.$get()).json(),
  });
  const add = useMutation({
    mutationFn: async (value: string) => {
      const res = await api.api.notes.$post({ json: { text: value } });
      if (!res.ok) throw new Error("Could not save the note");
      return res.json();
    },
    onSuccess: () => {
      setText("");
      return queryClient.invalidateQueries({ queryKey: ["notes"] });
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (text.trim()) add.mutate(text);
  }

  return (
    <Card className="mx-auto w-full max-w-lg">
      <CardHeader>
        <CardTitle>Notes</CardTitle>
        <CardDescription>The example table, read and written through the Worker.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={onSubmit} className="flex gap-2">
          <Input name="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a note" />
          <Button type="submit" disabled={add.isPending}>
            Add
          </Button>
        </form>
        {notes.isPending ? (
          <div className="flex flex-col gap-2" aria-label="Loading notes">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
          </div>
        ) : notes.data?.length ? (
          <ul className="flex flex-col gap-2 text-sm">
            {notes.data.map((n) => (
              <li key={n.id} className="rounded-md border px-3 py-2">
                {n.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
