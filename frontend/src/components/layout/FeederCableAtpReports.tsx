import { FileText, X } from "lucide-react";
import { useState } from "react";
import type { FeederCableAtpFile } from "../../types/data";

export function FeederCableAtpReports({ files, names, required }: {
  files: FeederCableAtpFile[]; names: string[]; required: boolean;
}) {
  const [preview, setPreview] = useState<FeederCableAtpFile | null>(null);
  if (!files.length && !names.length && !required) return null;

  return <section className="space-y-2" aria-label="Feeder Cable ATP reports">
    <h4 className="text-xs font-medium uppercase text-muted-foreground">Feeder Cable ATP</h4>
    {files.map((file) => <button key={file.relative_path} type="button" onClick={() => setPreview(file)}
      className="flex w-full items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-2 text-left text-[11px] font-semibold text-blue-950 hover:bg-blue-100">
      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" />
      <span className="min-w-0 break-all underline-offset-4 hover:underline">{file.file_name}</span>
    </button>)}
    {!files.length ? <p className="text-xs text-amber-700">
      {names.length ? `Listed in System Elements, but local PDF not found: ${names.join(", ")}` : "Required Feeder Cable ATP PDF is missing."}
    </p> : null}
    {preview ? <div className="fixed inset-0 z-[80]" onClick={(event) => event.stopPropagation()}>
      <button type="button" aria-label="Close Feeder Cable ATP preview overlay" className="absolute inset-0 bg-black/35" onClick={() => setPreview(null)} />
      <section className="absolute inset-3 flex flex-col overflow-hidden rounded-md border bg-background shadow-2xl md:inset-6">
        <header className="flex items-start justify-between gap-4 border-b bg-card p-4">
          <div className="min-w-0"><p className="text-xs font-semibold uppercase text-muted-foreground">Feeder Cable ATP</p>
            <h2 className="mt-1 break-all text-base font-semibold">{preview.file_name}</h2></div>
          <button type="button" aria-label="Close Feeder Cable ATP preview" className="rounded-md p-2 text-muted-foreground hover:bg-muted"
            onClick={() => setPreview(null)}><X className="h-4 w-4" /></button>
        </header>
        <iframe className="h-full w-full flex-1 bg-white" src={preview.url} title={preview.file_name} />
      </section>
    </div> : null}
  </section>;
}
