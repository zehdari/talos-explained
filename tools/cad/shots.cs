// Screenshot driver for the Talos CAD media library. Reads commands from C:\talos\jobs\args.txt (one per line,
// fields separated by '|'):
//   doc|<title>                      activate an open document
//   prefs|white                      plain white viewport, hide planes/origins/sketches, shaded with edges
//   prefs|restore                    restore the user's background colours
//   mode|edges|shaded                display mode
//   vis|all  /  vis|saved            show every top-level component / restore the saved visibility
//   only|<substr>,<substr>,...       show only top-level comps whose name contains one of the substrings
//   hide|<substr>,...                hide matching top-level comps
//   ghost|<substr>,...               matching comps keep their colours, all other visible comps go transparent grey
//   unghost                          remove the ghost appearances
//   shot|<out.bmp>|fx,fy,fz|[ux,uy,uz]|w,h|[x1,y1,z1,x2,y2,z2]
//   explode|<name>|on/off            show/collapse an exploded view
//   info                             print exploded views, comps, visibility
// Nothing is saved.
using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;
class J {
  static ModelDoc2 m;
  static Dictionary<string,int> saved = new Dictionary<string,int>();
  static string savedFile = @"C:\talos\explainer_cad\_out\saved_vis.txt";
  static double[] D(string s) { return s.Split(',').Select(x => double.Parse(x, System.Globalization.CultureInfo.InvariantCulture)).ToArray(); }
  static Component2[] Top() { return ((object[])((AssemblyDoc)m).GetComponents(true)).Cast<Component2>().ToArray(); }
  static Component2[] All() { return ((object[])((AssemblyDoc)m).GetComponents(false)).Cast<Component2>().ToArray(); }
  static bool IsLeaf(Component2 c) { object[] ch = (object[])c.GetChildren(); return ch == null || ch.Length == 0; }
  static bool Match(Component2 c, string[] pats) { foreach (var p in pats) {
      if (p.Length == 0) continue;
      if (p[0] == '^') { if (c.Name2.StartsWith(p.Substring(1), StringComparison.OrdinalIgnoreCase)) return true; }
      else if (c.Name2.IndexOf(p, StringComparison.OrdinalIgnoreCase) >= 0) return true; }
    return false; }
  // graphics + tree updates off while changing visibility/appearance (thousands of components); on for shots
  // freeze|none|gfx|tree|both picks what Freeze(true) turns off (default none). Visibility changes made with the
  // FeatureManager tree off did not reach the 2026-10-31 shots, appearance changes did.
  static string freezeMode = "none";
  static void Freeze(bool on) {
    if (m == null) return;
    bool g = freezeMode == "gfx" || freezeMode == "both", t = freezeMode == "tree" || freezeMode == "both";
    try { if (g || !on) ((ModelView)m.ActiveView).EnableGraphicsUpdate = !on; } catch {}
    try { if (t || !on) m.FeatureManager.EnableFeatureTree = !on; } catch {}
  }
  static int Main() {
    var app = Sw.App;
    app.FrameState = (int)swWindowState_e.swWindowMaximized;
    string[] lines = File.ReadAllLines(@"C:\talos\jobs\args.txt");
    foreach (string raw in lines) {
      string line = raw.Trim(); if (line.Length == 0 || line.StartsWith("#")) continue;
      string[] f = line.Split('|');
      var t0 = DateTime.Now;
      bool paint = f[0] == "color" || f[0] == "ghostleaf" || f[0] == "unghostleaf";
      try {
      if (paint && freezeMode == "none") { try { ((ModelView)m.ActiveView).EnableGraphicsUpdate = false; m.FeatureManager.EnableFeatureTree = false; } catch {} }
      switch (f[0]) {
        case "doc": m = Sw.Activate(f[1]); Freeze(true); break;
        case "freeze": Freeze(false); freezeMode = f[1]; Freeze(true); break;
        case "prefs":
          if (f[1] == "white") {
            string bk = @"C:\talos\explainer_cad\_out\prefs_backup.txt";
            if (!File.Exists(bk)) File.WriteAllText(bk, string.Format("{0}\n{1}\n{2}\n{3}\n",
              app.GetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swColorsBackgroundAppearance),
              app.GetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swSystemColorsViewportBackground),
              app.GetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swSystemColorsTopGradientColor),
              app.GetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swSystemColorsBottomGradientColor)));
            app.SetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swColorsBackgroundAppearance, (int)swColorsBackgroundAppearance_e.swColorsBackgroundAppearance_Plain);
            app.SetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swSystemColorsViewportBackground, 0xFFFFFF);
            m.Extension.SetUserPreferenceToggle((int)swUserPreferenceToggle_e.swViewDisplayHideAllTypes, 0, true);
          } else {
            string bk = @"C:\talos\explainer_cad\_out\prefs_backup.txt";
            string[] v = File.ReadAllLines(bk);
            app.SetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swColorsBackgroundAppearance, int.Parse(v[0]));
            app.SetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swSystemColorsViewportBackground, int.Parse(v[1]));
            app.SetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swSystemColorsTopGradientColor, int.Parse(v[2]));
            app.SetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swSystemColorsBottomGradientColor, int.Parse(v[3]));
            File.Delete(bk);
          }
          break;
        case "mode": {
          ModelView mv = (ModelView)m.ActiveView;
          mv.DisplayMode = f[1] == "edges" ? (int)swViewDisplayMode_e.swViewDisplayMode_ShadedWithEdges : (int)swViewDisplayMode_e.swViewDisplayMode_Shaded;
          break; }
        case "vis":
          if (!File.Exists(savedFile)) File.WriteAllLines(savedFile, All().Select(c => c.Name2 + "\t" + c.Visible));
          if (f[1] == "all") { foreach (var c in Top()) if (c.GetSuppression2() != 0) c.Visible = 1; }
          else { var sv = new Dictionary<string,int>(); foreach (var l in File.ReadAllLines(savedFile)) { var a = l.Split('\t'); sv[a[0]] = int.Parse(a[1]); }
                 foreach (var c in All()) if (sv.ContainsKey(c.Name2) && c.Visible != sv[c.Name2]) c.Visible = sv[c.Name2]; }
          break;
        case "only": { var p = f[1].Split(','); int n = 0; foreach (var c in Top()) { bool on = Match(c, p) && c.GetSuppression2() != 0; c.Visible = on ? 1 : 0; if (on) n++; } Sw.P("only {0}: {1} shown", f[1], n); break; }
        case "show": { var p = f[1].Split(','); foreach (var c in Top()) if (Match(c, p)) c.Visible = 1; break; }
        case "hide": { var p = f[1].Split(','); foreach (var c in Top()) if (Match(c, p)) c.Visible = 0; break; }
        case "hidesub": { var p = f[1].Split(','); int n = 0; foreach (var c in All()) if (Match(c, p)) { c.Visible = 0; n++; } Sw.P("hidesub {0}: {1}", f[1], n); break; }
        case "showsub": { var p = f[1].Split(','); foreach (var c in All()) if (Match(c, p)) c.Visible = 1; break; }
        case "ghostleaf": {
          // every visible leaf part outside the matches goes transparent grey; matches keep their own colours
          var p = f[1].Split(','); int n = 0;
          double tr = f.Length > 2 && f[2].Length > 0 ? double.Parse(f[2], System.Globalization.CultureInfo.InvariantCulture) : 0.82;
          foreach (var c in All()) {
            if (!IsLeaf(c) || Match(c, p) || c.GetSuppression2() == 0) continue;
            double[] mp = new double[]{0.80,0.82,0.84, 0.7,0.6,0.1,0.1, tr, 0};
            c.SetMaterialPropertyValues2(mp, (int)swInConfigurationOpts_e.swThisConfiguration, null); n++;
          }
          Sw.P("ghosted {0}", n);
          break; }
        case "color": {
          // leaves matching get a flat colour (r,g,b 0..1), optional transparency
          var p = f[1].Split(','); double[] rgb = D(f[2]); int n = 0;
          double tr = f.Length > 3 && f[3].Length > 0 ? double.Parse(f[3], System.Globalization.CultureInfo.InvariantCulture) : 0;
          foreach (var c in All()) {
            if (!IsLeaf(c) || !Match(c, p) || c.GetSuppression2() == 0) continue;
            double[] mp = new double[]{rgb[0],rgb[1],rgb[2], 0.75,0.65,0.25,0.3, tr, 0};
            c.SetMaterialPropertyValues2(mp, (int)swInConfigurationOpts_e.swThisConfiguration, null); n++;
          }
          Sw.P("color {0}: {1}", f[1], n);
          break; }
        case "onlyleaf": {
          // hide what doesn't match the include patterns (or matches the excludes), hiding whole subassemblies where
          // possible (one call per subtree instead of per leaf); never unhides
          var inc = f[1].Split(','); var exc = f.Length > 2 ? f[2].Split(',') : new string[0]; int nh = 0;
          var all = All();
          Func<Component2, bool> anyExc = null, anyInc = null;
          anyExc = c => { foreach (var k in all) if (k.Name2.StartsWith(c.Name2 + "/") && Match(k, exc)) return true; return false; };
          anyInc = c => { foreach (var k in all) if (k.Name2.StartsWith(c.Name2 + "/") && Match(k, inc)) return true; return false; };
          Action<Component2> walk = null;
          walk = c => {
            if (c.GetSuppression2() == 0 || c.Visible == 0) return;
            if (Match(c, exc)) { c.Visible = 0; nh++; return; }
            if (IsLeaf(c)) { if (!Match(c, inc)) { c.Visible = 0; nh++; } return; }
            if (Match(c, inc) && !anyExc(c)) return;      // keep the whole subassembly
            if (!Match(c, inc) && !anyInc(c)) { c.Visible = 0; nh++; return; }   // nothing to keep below: hide it whole
            foreach (object o in (object[])c.GetChildren()) walk((Component2)o);
          };
          foreach (var c in Top()) walk(c);
          Sw.P("onlyleaf {0} -{1}: {2} hidden", f[1], f.Length > 2 ? f[2] : "", nh);
          break; }
        case "stl": {
          // binary STL in mm, assembly frame, one file, given quality (coarse|fine)
          // remember the user's STL options and put them back afterwards
          int[] tg = { (int)swUserPreferenceToggle_e.swSTLBinaryFormat, (int)swUserPreferenceToggle_e.swSTLComponentsIntoOneFile, (int)swUserPreferenceToggle_e.swSTLDontTranslateToPositive };
          int[] iv = { (int)swUserPreferenceIntegerValue_e.swExportStlUnits, (int)swUserPreferenceIntegerValue_e.swSTLQuality };
          bool[] tg0 = tg.Select(k => app.GetUserPreferenceToggle(k)).ToArray();
          int[] iv0 = iv.Select(k => app.GetUserPreferenceIntegerValue(k)).ToArray();
          app.SetUserPreferenceToggle((int)swUserPreferenceToggle_e.swSTLBinaryFormat, true);
          app.SetUserPreferenceToggle((int)swUserPreferenceToggle_e.swSTLComponentsIntoOneFile, true);
          app.SetUserPreferenceToggle((int)swUserPreferenceToggle_e.swSTLDontTranslateToPositive, true);
          app.SetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swExportStlUnits, (int)swLengthUnit_e.swMM);
          app.SetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swSTLQuality,
            f.Length > 2 && f[2] == "fine" ? (int)swSTLQuality_e.swSTLQuality_Fine : (int)swSTLQuality_e.swSTLQuality_Coarse);
          Directory.CreateDirectory(Path.GetDirectoryName(f[1]));
          int e = 0, w = 0;
          bool ok = m.Extension.SaveAs3(f[1], 0, (int)swSaveAsOptions_e.swSaveAsOptions_Silent | (int)swSaveAsOptions_e.swSaveAsOptions_Copy, null, null, ref e, ref w);
          for (int k = 0; k < tg.Length; k++) app.SetUserPreferenceToggle(tg[k], tg0[k]);
          for (int k = 0; k < iv.Length; k++) app.SetUserPreferenceIntegerValue(iv[k], iv0[k]);
          Sw.P("stl {0}: {1} e={2} w={3} {4} KB", Path.GetFileName(f[1]), ok, e, w, File.Exists(f[1]) ? new FileInfo(f[1]).Length / 1024 : -1);
          break; }
        case "unghostleaf":
          foreach (var c in All()) if (IsLeaf(c)) c.RemoveMaterialProperty2((int)swInConfigurationOpts_e.swThisConfiguration, null);
          break;
        case "ghost": {
          var p = f[1].Split(',');
          foreach (var c in Top()) {
            if (c.Visible == 0 || Match(c, p)) continue;
            double[] mp = new double[]{0.80,0.82,0.84, 0.7,0.6,0.1,0.1, 0.82, 0};
            c.SetMaterialPropertyValues2(mp, (int)swInConfigurationOpts_e.swThisConfiguration, null);
          }
          break; }
        case "unghost":
          foreach (var c in Top()) c.RemoveMaterialProperty2((int)swInConfigurationOpts_e.swThisConfiguration, null);
          break;
        case "explode": {
          AssemblyDoc a = (AssemblyDoc)m;
          if (f[2] == "on") Sw.P("explode {0}: {1}", f[1], a.ShowExploded2(true, f[1])); else Sw.P("collapse: {0}", a.ShowExploded2(false, f[1]));
          break; }
        case "info": {
          AssemblyDoc a = (AssemblyDoc)m;
          string cfg = m.ConfigurationManager.ActiveConfiguration.Name;
          int ne = a.GetExplodedViewCount2(cfg);
          Sw.P("exploded views in {0}: {1}", cfg, ne);
          if (ne > 0) foreach (string s in (string[])a.GetExplodedViewNames2(cfg)) Sw.P("  {0}", s);
          foreach (var c in Top()) Sw.P("  {0} vis={1} supp={2}", c.Name2, c.Visible, c.GetSuppression2());
          break; }
        case "shot": {
          double[] from = D(f[2]);
          double[] up = f[3].Length > 0 ? D(f[3]) : null;
          double[] wh = D(f[4]);
          double[] box = f.Length > 5 && f[5].Length > 0 ? D(f[5]) : null;
          Directory.CreateDirectory(Path.GetDirectoryName(f[1]));
          Freeze(false);
          bool ok = Sw.Shot(m, f[1], from, up, box, (int)wh[0], (int)wh[1]);
          Freeze(true);
          Sw.P("shot {0}: {1}", Path.GetFileName(f[1]), ok);
          break; }
        default: Sw.P("unknown {0}", f[0]); break;
      }
      } catch (Exception e) { Sw.P("ERR {0}: {1}", line, e.Message); }
      if (paint && freezeMode == "none") { try { ((ModelView)m.ActiveView).EnableGraphicsUpdate = true; m.FeatureManager.EnableFeatureTree = true; } catch {} }
      double dt = (DateTime.Now - t0).TotalSeconds; if (dt > 5) Sw.P("  ({0:F0}s) {1}", dt, f[0]);
    }
    Freeze(false);
    return 0;
  }
}
