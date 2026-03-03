"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function JoinCampaignForm() {
  const [value, setValue] = useState("");
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;

    // Accept full URL or raw campaign ID
    const match = trimmed.match(/campaign\/([a-zA-Z0-9-]+)/);
    const campaignId = match ? match[1] : trimmed;
    router.push(`/campaign/${campaignId}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-3">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Paste invite link or campaign ID"
        className="flex-1 bg-iron border-gunmetal placeholder:text-ash placeholder:uppercase placeholder:text-xs placeholder:tracking-widest focus:border-brass focus:shadow-[0_0_12px_rgba(196,148,61,0.2)]"
      />
      <Button type="submit" size="lg">
        Join
      </Button>
    </form>
  );
}
