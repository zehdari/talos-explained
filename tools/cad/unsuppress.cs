// Resolve every top-level component of the open assembly (in memory only; nothing is saved).
using System;
using System.IO;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;
class J {
  static int Main() {
    string title = File.Exists(@"C:\talos\jobs\args.txt") ? File.ReadAllText(@"C:\talos\jobs\args.txt").Trim() : "Talos.SLDASM";
    ModelDoc2 m = Sw.Activate(title);
    AssemblyDoc a = (AssemblyDoc)m;
    var t0 = DateTime.Now;
    int n = 0;
    foreach (object o in (object[])a.GetComponents(true)) {
      Component2 k = (Component2)o;
      if (k.GetSuppression2() == 0) {
        int r = k.SetSuppression2((int)swComponentSuppressionState_e.swComponentFullyResolved);
        Sw.P("{0}: {1} -> {2} exists={3}", k.Name2, r, k.GetSuppression2(), File.Exists(k.GetPathName()) ? k.GetPathName() : "NO " + k.GetPathName());
        n++;
      }
    }
    Sw.P("unsuppressed {0} in {1:F0}s", n, (DateTime.Now-t0).TotalSeconds);
    m.ForceRebuild3(false);
    Sw.P("rebuilt {0:F0}s", (DateTime.Now-t0).TotalSeconds);
    return 0;
  }
}
