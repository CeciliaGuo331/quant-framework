import { useState } from "react"
import { Settings2 } from "lucide-react"

import { getApiBase } from "@/lib/api"
import { createModelProviderId } from "@/lib/modelProviderId"
import { SearchProviderSettings } from "@/components/SearchProviderSettings"
import { useLanguage } from "@/contexts/LanguageContext"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

interface Profile { id: string; name: string; base_url: string; model: string; has_api_key?: boolean }
interface Settings { mode: string; active_id: string | null; profiles: Profile[]; environment_configured: boolean }
const fresh = (): Profile => ({ id: createModelProviderId(), name: "", base_url: "", model: "" })

export function ModelProviderSettings({ collapsed = false }: { collapsed?: boolean }) {
  const { language } = useLanguage()
  const tr = (en: string, zh: string) => language === "zh" ? zh : en
  const [open, setOpen] = useState(false)
  const [section, setSection] = useState<"model" | "search">("model")
  const [settings, setSettings] = useState<Settings | null>(null)
  const [profile, setProfile] = useState<Profile>(fresh)
  const [key, setKey] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const local = settings?.mode === "local"
  async function request(path = "", init?: RequestInit) {
    const response = await fetch(getApiBase() + "/model-providers" + path, init)
    const value = await response.json()
    if (!response.ok) throw new Error(typeof value.detail === "string" ? value.detail : "Check the provider settings.")
    return value
  }
  function select(row?: Profile) {
    setProfile(row || fresh())
    setKey("")
    setMessage("")
  }
  async function show(value: boolean) {
    setOpen(value)
    setKey("")
    if (!value) return
    setBusy(true)
    try {
      const data: Settings = await request()
      setSettings(data)
      select(data.profiles.find(row => row.id === data.active_id))
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load settings.") }
    finally { setBusy(false) }
  }
  async function submit(test: boolean, activate = true) {
    setBusy(true)
    setMessage("")
    try {
      const result = await request(test ? "/test" : "", {
        method: test ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: profile.id, name: profile.name, base_url: profile.base_url, model: profile.model, api_key: key, activate }),
      })
      if (test) setMessage(result.message)
      else {
        setSettings(result)
        setProfile(result.profiles.find((row: Profile) => row.id === profile.id))
        setKey("")
        setMessage(activate ? tr("Saved. New Agent runs use this provider; active runs keep their current provider.", "已保存，新任务使用此模型，运行中的任务继续使用原模型。") : tr("Profile saved. You can select it separately for search.", "配置已保存，可以单独选为搜索账户。"))
        window.dispatchEvent(new Event("alphalab:model-provider-changed"))
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Provider request failed.") }
    finally { setBusy(false) }
  }
  const inputClass = "mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm"
  return (
    <Dialog open={open} onOpenChange={value => void show(value)}>
      <DialogTrigger asChild>
        <button type="button" title={tr("Model and search", "模型与搜索")} aria-label={tr("Model and search", "模型与搜索")}
          className={"flex h-9 w-full items-center gap-2 rounded text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground " + (collapsed ? "justify-center" : "px-2")}>
          <Settings2 className="h-4 w-4 shrink-0" />
          {!collapsed && <span>{tr("Model and search", "模型与搜索")}</span>}
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{tr("Model and search", "模型与搜索")}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{tr("Settings are shared by this workstation. Separate local installations can choose different providers. API keys stay on the server.", "设置由本工作站共享，各自的本地安装可以使用不同服务商。密钥只保存在服务端。")}</p>
        <nav className="flex gap-2 rounded border border-border p-1" aria-label={tr("Settings category", "设置分类")}>
          <button type="button" aria-pressed={section === "model"} className={"flex-1 rounded px-3 py-2 text-sm " + (section === "model" ? "bg-muted font-medium" : "text-muted-foreground")} onClick={() => setSection("model")}>{tr("Research model", "研究模型")}</button>
          <button type="button" aria-pressed={section === "search"} className={"flex-1 rounded px-3 py-2 text-sm " + (section === "search" ? "bg-muted font-medium" : "text-muted-foreground")} onClick={() => setSection("search")}>{tr("Web search", "网页搜索")}</button>
        </nav>
        <div hidden={section !== "model"} className="space-y-3">
        <h3 className="text-sm font-semibold">{tr("Research model", "研究模型")}</h3>
        {settings && !local && <p className="rounded border border-amber-500/30 p-3 text-sm">{tr("This workstation uses a remote Agent. Manage its providers on the remote host.", "此工作站使用远程 Agent，请在远端管理模型与搜索配置。")}</p>}
        <label className="text-sm">{tr("Saved provider", "已保存的服务配置")}
          <select className={inputClass} value={settings?.profiles.some(row => row.id === profile.id) ? profile.id : ""}
            disabled={busy} onChange={event => select(settings?.profiles.find(row => row.id === event.target.value))}>
            <option value="">{tr("Add a provider", "添加服务配置")}</option>
            {settings?.profiles.map(row => <option key={row.id} value={row.id}>{row.name}{row.id === settings.active_id ? " (active)" : ""}</option>)}
          </select>
        </label>
        {settings?.active_id === "environment" && <p className="text-xs text-muted-foreground">The Agent currently uses the model configured in the process environment. Saving activates this profile instead.</p>}
        <form className="space-y-3" onSubmit={event => { event.preventDefault(); void submit(false) }}>
          <fieldset disabled={busy || !local} className="space-y-3 disabled:opacity-60">
            <label className="block text-sm">{tr("Display name", "配置名称")}
              <input className={inputClass} required maxLength={100} value={profile.name}
                onChange={event => setProfile({ ...profile, name: event.target.value })} placeholder="My research model" />
            </label>
            <div className="flex flex-wrap gap-2 text-xs">
              <button type="button" className="rounded border px-2 py-1" onClick={() => { setProfile({ ...profile, name: "OpenRouter", base_url: "https://openrouter.ai/api/v1" }); setKey("") }}>OpenRouter</button>
              <button type="button" className="rounded border px-2 py-1" onClick={() => { setProfile({ ...profile, name: "Local model", base_url: "http://127.0.0.1:11434/v1" }); setKey("") }}>{tr("Local endpoint", "本地模型")}</button>
              <span className="self-center text-muted-foreground">{tr("or enter another compatible provider below", "也可在下方填写其他兼容服务")}</span>
            </div>
            <label className="block text-sm">{tr("API base URL", "API 地址")}
              <input className={inputClass} type="url" required value={profile.base_url}
                onChange={event => { setProfile({ ...profile, base_url: event.target.value }); setKey("") }} placeholder="https://provider.example/v1" />
            </label>
            <label className="block text-sm">{tr("Model ID", "模型名称 / ID")}
              <input className={inputClass} required value={profile.model} onChange={event => setProfile({ ...profile, model: event.target.value })} placeholder="Exact model ID from your provider" />
            </label>
            <label className="block text-sm">{tr("API key", "API 密钥")}
              <input className={inputClass} type="password" autoComplete="new-password" value={key}
                onChange={event => setKey(event.target.value)} placeholder={profile.has_api_key ? tr("Stored on the server; leave blank to keep it", "已保存在服务端，留空保留") : tr("Required for a remote provider", "远程服务需填写密钥")} />
            </label>
            <p className="text-xs text-muted-foreground">{tr("Use a tool-capable model with an OpenAI-compatible endpoint. Native Anthropic/Gemini require a compatible gateway. Local model servers may omit a key.", "请选择支持工具调用的模型，接口需兼容 OpenAI。Anthropic/Gemini 原生接口需通过兼容网关。本地模型可不填密钥。")}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => void submit(true)}>{tr("Test model", "测试模型")}</button>
              <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => void submit(false, false)}>{tr("Save profile", "仅保存配置")}</button>
              <button type="submit" className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground">{tr("Save and use", "保存并使用")}</button>
            </div>
            <p className="text-xs text-muted-foreground">{tr("Test model sends a short request and may incur a provider charge.", "测试模型会发送一条简短请求，可能产生服务商费用。")}</p>
          </fieldset>
        </form>
        <p role="status" aria-live="polite" className="text-sm">{busy ? "Working…" : message}</p>
        </div>
        <div hidden={section !== "search"}><SearchProviderSettings open={open} local={local} profiles={settings?.profiles || []} /></div>
      </DialogContent>
    </Dialog>
  )
}
