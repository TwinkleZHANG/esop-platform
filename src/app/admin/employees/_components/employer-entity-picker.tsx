"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface EmployerEntity {
  id: string;
  name: string;
}

interface Props {
  value: string[];
  onChange: (ids: string[]) => void;
}

export function EmployerEntityPicker({ value, onChange }: Props) {
  const [entities, setEntities] = useState<EmployerEntity[]>([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/employer-entities");
    const json = await res.json();
    if (json.success) setEntities(json.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }

  async function addNew() {
    setError(null);
    if (!newName.trim()) return;
    const res = await fetch("/api/employer-entities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const json = await res.json();
    if (!json.success) {
      setError(json.error ?? "新增失败");
      return;
    }
    await load();
    onChange([...value, json.data.id]);
    setNewName("");
    setAdding(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {entities.length === 0 && (
          <span className="text-sm text-muted-foreground">暂无用工主体</span>
        )}
        {entities.map((e) => (
          <label
            key={e.id}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm"
          >
            <input
              type="checkbox"
              checked={value.includes(e.id)}
              onChange={() => toggle(e.id)}
            />
            {e.name}
          </label>
        ))}
      </div>

      {adding ? (
        <div className="flex items-center gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="新用工主体名称"
            className="w-60"
          />
          <Button type="button" size="sm" onClick={addNew}>
            保存
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setAdding(false);
              setNewName("");
              setError(null);
            }}
          >
            取消
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setAdding(true)}
        >
          + 新增用工主体
        </Button>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
