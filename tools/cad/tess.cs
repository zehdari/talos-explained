// Export the display tessellation of listed leaf components of the open Talos.SLDASM, with each face's
// resolved appearance colour, for the hero GLB (tools/cad/build_hero.py). Nothing is changed or saved.
// args.txt: line 1 = output folder (Windows path), line 2 = assembly title, then one component Name2 per line.
// Output: <dir>\tess.bin (per component: int32 name length, name UTF8, 12 doubles transform (Transform2.ArrayData
// first 12), int32 nface; per face: int32 colour index, int32 nfloat, nfloat float32 (triangles, part space, metres))
//         <dir>\colors.txt (index \t source \t 9 material values)  <dir>\tess_log.txt
using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Collections.Generic;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;
class J {
  static Dictionary<string,int> cols = new Dictionary<string,int>();
  static List<string> colList = new List<string>();
  static int Col(string src, double[] v) {
    var ic = System.Globalization.CultureInfo.InvariantCulture;
    string k = src + "\t" + (v == null ? "" : string.Join(",", v.Select(x => x.ToString("G5", ic))));
    int i; if (cols.TryGetValue(k, out i)) return i;
    cols[k] = colList.Count; colList.Add(k); return colList.Count - 1;
  }
  static double[] Valid(object o) { var v = o as double[]; return (v != null && v.Length >= 3 && v[0] >= 0 && v[1] >= 0 && v[2] >= 0) ? v : null; }
  static int Main() {
    string[] lines = File.ReadAllLines(@"C:\talos\jobs\args.txt");
    string dir = lines[0].Trim(); string title = lines[1].Trim();
    var want = new HashSet<string>(lines.Skip(2).Select(l => l.Trim()).Where(l => l.Length > 0));
    Directory.CreateDirectory(dir);
    ModelDoc2 m = Sw.Activate(title);
    var all = ((object[])((AssemblyDoc)m).GetComponents(false)).Cast<Component2>().ToArray();
    var log = new StringBuilder();
    var featColParts = new Dictionary<string,bool>();
    var plog = new StreamWriter(Path.Combine(dir, "progress.txt")); plog.AutoFlush = true;
    var t0 = DateTime.Now;
    long ntri = 0; int ncomp = 0;
    int cfg = (int)swInConfigurationOpts_e.swThisConfiguration;
    using (var bw = new BinaryWriter(File.Create(Path.Combine(dir, "tess.bin")))) {
      foreach (var c in all) {
        if (!want.Contains(c.Name2)) continue;
        want.Remove(c.Name2);
        var t1 = DateTime.Now;
        double[] cc = Valid(c.GetMaterialPropertyValues2(cfg, null));
        double[] pc = null;
        ModelDoc2 pd = (ModelDoc2)c.GetModelDoc2();
        try { if (pd != null) pc = Valid(pd.MaterialPropertyValues); } catch {}
        bool hasFeat = false;
        string pp = c.GetPathName() + "|" + c.ReferencedConfiguration;
        if (!featColParts.TryGetValue(pp, out hasFeat)) {
          try {
            object[] feats = pd == null ? null : (object[])pd.FeatureManager.GetFeatures(false);
            if (feats != null) foreach (object fo2 in feats) { if (Valid(((Feature)fo2).GetMaterialPropertyValues2(cfg, null)) != null) { hasFeat = true; break; } }
          } catch {}
          featColParts[pp] = hasFeat;
        }
        object bi;
        object[] bodies = (object[])c.GetBodies3((int)swBodyType_e.swAllBodies, out bi);
        var faces = new List<KeyValuePair<int,float[]>>();
        var featCache = new Dictionary<string,double[]>();
        if (bodies != null) foreach (object bo in bodies) {
          Body2 b = (Body2)bo;
          try { if (!b.Visible) continue; } catch {}
          double[] bc = null;
          try { bc = Valid(b.MaterialPropertyValues2); } catch {}
          object[] fs = (object[])b.GetFaces();
          if (fs == null) continue;
          foreach (object fo in fs) {
            Face2 f = (Face2)fo;
            float[] tr = f.GetTessTriangles(true) as float[];
            if (tr == null || tr.Length == 0) continue;
            double[] fc = Valid(f.MaterialPropertyValues);
            double[] ftc = null;
            if (fc == null && hasFeat) {
              try {
                Feature ft = (Feature)f.GetFeature();
                if (ft != null) {
                  string fn = ft.Name;
                  if (!featCache.TryGetValue(fn, out ftc)) { ftc = Valid(ft.GetMaterialPropertyValues2(cfg, null)); featCache[fn] = ftc; }
                }
              } catch {}
            }
            int ci = fc != null ? Col("face", fc) : ftc != null ? Col("feature", ftc) : bc != null ? Col("body", bc) : cc != null ? Col("comp", cc) : pc != null ? Col("part", pc) : Col("none", null);
            faces.Add(new KeyValuePair<int,float[]>(ci, tr));
          }
        }
        byte[] nb = Encoding.UTF8.GetBytes(c.Name2);
        bw.Write(nb.Length); bw.Write(nb);
        double[] a = c.Transform2 == null ? new double[]{1,0,0,0,1,0,0,0,1,0,0,0} : (double[])c.Transform2.ArrayData;
        for (int k = 0; k < 12; k++) bw.Write(a[k]);
        bw.Write(faces.Count);
        long nt = 0;
        foreach (var kv in faces) { bw.Write(kv.Key); bw.Write(kv.Value.Length); foreach (float x in kv.Value) bw.Write(x); nt += kv.Value.Length / 9; }
        ntri += nt; ncomp++;
        log.AppendFormat("{0}\t{1}\t{2}\t{3:F2}\t{4}\n", c.Name2, faces.Count, nt, (DateTime.Now - t1).TotalSeconds, hasFeat ? "featcol" : "");
        plog.WriteLine("{0}\t{1}\t{2}\t{3:F1}", ncomp, c.Name2, nt, (DateTime.Now - t0).TotalSeconds);
      }
    }
    plog.Close();
    File.WriteAllLines(Path.Combine(dir, "colors.txt"), colList.Select((s, i) => i + "\t" + s));
    foreach (var w in want) log.AppendFormat("MISSING\t{0}\n", w);
    File.WriteAllText(Path.Combine(dir, "tess_log.txt"), log.ToString());
    Sw.P("components {0}, triangles {1}, colours {2}, missing {3}, {4:F0}s", ncomp, ntri, colList.Count, want.Count, (DateTime.Now - t0).TotalSeconds);
    return 0;
  }
}
