// Dump the Talos assembly tree: per component name, file, suppression, hidden, transform, bbox, material, mass.
// Run with ~/.claude/skills/solidworks-cad/scripts/swjob dump_tree.cs (SWARGS = assembly title).
using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;
class J {
  static StringBuilder sb = new StringBuilder();
  static Dictionary<string,string> massCache = new Dictionary<string,string>();
  static string Esc(string s) { return s == null ? "" : s.Replace("\\","\\\\").Replace("\"","\\\""); }
  static string Mass(ModelDoc2 d, string cfg) {
    if (d == null) return "null";
    string key = d.GetPathName() + "|" + cfg;
    if (massCache.ContainsKey(key)) return massCache[key];
    string r = "null";
    try {
      MassProperty2 mp = (MassProperty2)d.Extension.CreateMassProperty2();
      if (mp != null) {
        double[] c = (double[])mp.CenterOfMass;
        r = string.Format(System.Globalization.CultureInfo.InvariantCulture,
          "{{\"kg\":{0:G6},\"vol_mm3\":{1:G6},\"com_mm\":[{2:F2},{3:F2},{4:F2}]}}",
          mp.Mass, mp.Volume*1e9, c[0]*1000, c[1]*1000, c[2]*1000);
      }
    } catch (Exception e) { r = "\"err " + Esc(e.Message) + "\""; }
    massCache[key] = r; return r;
  }
  static void Walk(Component2 c, string parent, int depth) {
    object[] ch = (object[])c.GetChildren();
    if (ch == null) return;
    foreach (object o in ch) {
      Component2 k = (Component2)o;
      string name = k.Name2;
      string path = k.GetPathName();
      int supp = k.GetSuppression2();
      bool hidden = k.IsHidden(true);
      ModelDoc2 d = (ModelDoc2)k.GetModelDoc2();
      string mat = "";
      if (d != null && d.GetType() == (int)swDocumentTypes_e.swDocPART) {
        string db; mat = ((PartDoc)d).GetMaterialPropertyName2(k.ReferencedConfiguration, out db);
      }
      double[] a = k.Transform2 == null ? null : (double[])k.Transform2.ArrayData;
      double[] bx = null; try { bx = (double[])k.GetBox(false, false); } catch {}
      var ic = System.Globalization.CultureInfo.InvariantCulture;
      string tf = a == null ? "null" : string.Format(ic, "[{0:F5},{1:F5},{2:F5},{3:F5},{4:F5},{5:F5},{6:F5},{7:F5},{8:F5},{9:F3},{10:F3},{11:F3}]",
        a[0],a[1],a[2],a[3],a[4],a[5],a[6],a[7],a[8],a[9]*1000,a[10]*1000,a[11]*1000);
      string box = bx == null ? "null" : string.Format(ic, "[{0:F2},{1:F2},{2:F2},{3:F2},{4:F2},{5:F2}]", bx[0]*1000,bx[1]*1000,bx[2]*1000,bx[3]*1000,bx[4]*1000,bx[5]*1000);
      sb.AppendFormat("{{\"name\":\"{0}\",\"parent\":\"{1}\",\"depth\":{2},\"file\":\"{3}\",\"config\":\"{4}\",\"suppressed\":{5},\"hidden\":{6},\"material\":\"{7}\",\"xf\":{8},\"box\":{9},\"mass\":{10},\"nchild\":{11}}}\n",
        Esc(name), Esc(parent), depth, Esc(path), Esc(k.ReferencedConfiguration), supp == 0 ? "true":"false", hidden ? "true":"false", Esc(mat), tf, box,
        supp == 0 ? "null" : Mass(d, k.ReferencedConfiguration), ch == null ? 0 : ((object[])k.GetChildren() ?? new object[0]).Length);
      Walk(k, name, depth+1);
    }
  }
  static int Main() {
    string title = File.Exists(@"C:\talos\jobs\args.txt") ? File.ReadAllText(@"C:\talos\jobs\args.txt").Trim() : "Talos.SLDASM";
    ModelDoc2 m = Sw.Activate(title);
    AssemblyDoc a = (AssemblyDoc)m;
    var t0 = DateTime.Now;
    int res = a.ResolveAllLightWeightComponents(false);
    Sw.P("resolve {0} {1:F0}s", res, (DateTime.Now-t0).TotalSeconds);
    m.ForceRebuild3(false);
    Walk((Component2)m.ConfigurationManager.ActiveConfiguration.GetRootComponent3(true), "", 0);
    string outp = @"C:\talos\explainer_cad\_out\tree_" + Path.GetFileNameWithoutExtension(title).Replace(' ','_') + ".jsonl";
    Directory.CreateDirectory(Path.GetDirectoryName(outp));
    File.WriteAllText(outp, sb.ToString());
    Sw.P("assembly mass {0}", Mass(m, ""));
    double[] b = (double[])a.GetBox(0);
    if (b != null) Sw.P("box {0:F1} {1:F1} {2:F1} .. {3:F1} {4:F1} {5:F1}", b[0]*1000,b[1]*1000,b[2]*1000,b[3]*1000,b[4]*1000,b[5]*1000);
    Sw.P("configs: {0}", string.Join(",", (string[])m.GetConfigurationNames()));
    Sw.P("active config: {0}", m.ConfigurationManager.ActiveConfiguration.Name);
    Sw.P("wrote {0}", outp);
    return 0;
  }
}
