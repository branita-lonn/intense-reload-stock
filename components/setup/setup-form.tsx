// components/setup/setup-form.tsx
// The actual first-run setup form. Plain, mobile-first.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  firstRunSetupSchema,
  type FirstRunSetupInput,
} from "@/lib/validations/first-run-setup";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function SetupForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FirstRunSetupInput>({
    resolver: zodResolver(firstRunSetupSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: FirstRunSetupInput) {
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const data = await response.json();
        toast.error(data.error ?? "Something went wrong. Please try again.");
        if (response.status === 400) {
          // Setup was already completed by the time this submitted —
          // send them to login rather than leaving them stuck on a dead form.
          router.push("/auth/login");
        }
        return;
      }

      toast.success("Account created. You can now log in.");
      router.push("/auth/login");
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : "Network error";
      console.error("[setup-form] Submit error:", errorMsg);
      toast.error("Network error. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label htmlFor="name" className="text-sm font-medium block mb-1">
          Your name
        </label>
        <Input id="name" autoComplete="name" {...form.register("name")} />
        {form.formState.errors.name && (
          <p className="text-sm text-destructive mt-1">
            {form.formState.errors.name.message}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="email" className="text-sm font-medium block mb-1">
          Email
        </label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          {...form.register("email")}
        />
        {form.formState.errors.email && (
          <p className="text-sm text-destructive mt-1">
            {form.formState.errors.email.message}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="password" className="text-sm font-medium block mb-1">
          Password
        </label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          {...form.register("password")}
        />
        {form.formState.errors.password && (
          <p className="text-sm text-destructive mt-1">
            {form.formState.errors.password.message}
          </p>
        )}
      </div>

      <Button type="submit" disabled={isSubmitting} className="w-full min-h-[44px]">
        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Create owner account
      </Button>
    </form>
  );
}
