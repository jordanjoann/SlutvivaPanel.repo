"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, SendIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PanelRole, PanelUser } from "@/lib/server/panel-users";

const ROLE_OPTIONS: Exclude<PanelRole, "owner">[] = ["admin", "moderator", "viewer"];

type EditableRole = (typeof ROLE_OPTIONS)[number];

export function UsersManager({
  users: initialUsers,
  currentUserId,
}: {
  users: PanelUser[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState<EditableRole>("viewer");
  const [busy, setBusy] = useState(false);
  const [roleBusy, setRoleBusy] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);

    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, role, pin }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        user?: PanelUser;
        error?: string;
      };
      if (!response.ok || !data.user) throw new Error(data.error ?? "User creation failed.");

      setUsers((current) => sortUsers([...current, data.user!]));
      setUsername("");
      setEmail("");
      setPin("");
      setRole("viewer");
      toast.success("User created and emailed");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "User creation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(userId: string, nextRole: EditableRole) {
    const previous = users;
    setRoleBusy(userId);
    setUsers((current) =>
      current.map((user) => (user.id === userId ? { ...user, role: nextRole } : user)),
    );

    try {
      const response = await fetch(`/api/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        user?: PanelUser;
        error?: string;
      };
      if (!response.ok || !data.user) throw new Error(data.error ?? "Role update failed.");

      setUsers((current) =>
        current.map((user) => (user.id === userId ? data.user! : user)),
      );
      toast.success("Role updated");
      router.refresh();
    } catch (error) {
      setUsers(previous);
      toast.error(error instanceof Error ? error.message : "Role update failed.");
    } finally {
      setRoleBusy(null);
    }
  }

  return (
    <div className="grid gap-6">
      <form className="grid gap-4 lg:grid-cols-[1fr_1fr_10rem_10rem_auto] lg:items-end" onSubmit={submit}>
        <div className="grid gap-1.5">
          <Label htmlFor="new-user-username">Username</Label>
          <Input
            id="new-user-username"
            autoComplete="off"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="new-user-email">Email</Label>
          <Input
            id="new-user-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="new-user-role">Role</Label>
          <Select value={role} onValueChange={(next) => setRole(next as EditableRole)}>
            <SelectTrigger id="new-user-role" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {roleLabel(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="new-user-pin">Starting PIN</Label>
          <Input
            id="new-user-pin"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            value={pin}
            onChange={(event) => setPin(event.target.value)}
          />
        </div>
        <Button type="submit" disabled={busy || !username.trim() || !email.trim() || !pin.trim()}>
          {busy ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
          Create
        </Button>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Email</TableHead>
            <TableHead className="w-40">Role</TableHead>
            <TableHead className="text-right">Last Login</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => {
            const isCurrentOwner = user.id === currentUserId && user.role === "owner";
            const canEditRole = user.role !== "owner" && !isCurrentOwner;
            return (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.username}</TableCell>
                <TableCell className="text-muted-foreground">{user.email}</TableCell>
                <TableCell>
                  {canEditRole ? (
                    <Select
                      value={user.role}
                      disabled={roleBusy === user.id}
                      onValueChange={(next) => changeRole(user.id, next as EditableRole)}
                    >
                      <SelectTrigger size="sm" className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="end">
                        {ROLE_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {roleLabel(option)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline">{roleLabel(user.role)}</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {formatDate(user.lastLoginAt)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function sortUsers(users: PanelUser[]): PanelUser[] {
  return users.toSorted((a, b) => {
    if (a.role === "owner" && b.role !== "owner") return -1;
    if (a.role !== "owner" && b.role === "owner") return 1;
    return a.createdAt - b.createdAt;
  });
}

function roleLabel(role: PanelRole): string {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  if (role === "moderator") return "Moderator";
  return "Viewer";
}

function formatDate(value: number | undefined): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
