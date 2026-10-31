// Repoint the external references of every assembly in the working copy C:\talos\explainer_cad
// to files in that same folder (the team's Pack-and-Go stored C:\Users\...\CopyDesignTemp paths).
// Only touches the working copy; the originals (zip, C:\talos\orig) are untouched.
using System;
using System.IO;
using SolidWorks.Interop.sldworks;
class J {
  static int Main() {
    string dir = @"C:\talos\explainer_cad";
    int fixedN = 0, missing = 0;
    foreach (string f in Directory.GetFiles(dir, "*.SLDASM")) {
      object o = Sw.App.GetDocumentDependencies2(f, false, false, false);
      string[] deps = o as string[];
      if (deps == null) { Sw.P("{0}: no deps", Path.GetFileName(f)); continue; }
      for (int i = 0; i + 1 < deps.Length; i += 2) {
        string old = deps[i+1];
        if (old.StartsWith(dir, StringComparison.OrdinalIgnoreCase)) continue;
        string nw = Path.Combine(dir, Path.GetFileName(old));
        if (!File.Exists(nw)) { Sw.P("{0}: MISSING {1}", Path.GetFileName(f), old); missing++; continue; }
        bool ok = Sw.App.ReplaceReferencedDocument(f, old, nw);
        if (ok) fixedN++; else Sw.P("{0}: replace failed {1}", Path.GetFileName(f), old);
      }
    }
    Sw.P("fixed {0} missing {1}", fixedN, missing);
    return 0;
  }
}
