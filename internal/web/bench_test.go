package web

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"yavc.app/internal/session"
)

// realSite is the engine over the repository's own packages, PUDL and
// pages, as the site runs.
func realSite(tb testing.TB) *Server {
	tb.Helper()
	root := filepath.Join("..", "..")
	store, err := session.New(tb.TempDir(), time.Hour)
	if err != nil {
		tb.Fatal(err)
	}
	s, err := New(&Server{Domain: testDomain, Applets: []string{filepath.Join(root, "applets"), filepath.Join(root, "apps")},
		PUDL: filepath.Join(root, "web", "pudl"), Pages: filepath.Join(root, "pages"), Bin: filepath.Join(root, "site", "bin"),
		Home: filepath.Join(root, "site", "home"), Sessions: store, Title: "yavc.app"})
	if err != nil {
		tb.Fatal(err)
	}
	return s
}

// threeWindows is a desktop address with three windows of real packages.
func threeWindows(tb testing.TB, s *Server) string {
	list := s.applets()
	if len(list) < 3 {
		tb.Skip("the repository has fewer than three packages")
	}
	return "/?open=" + list[0].Name + "," + list[1].Name + "," + list[2].Name
}

func get(b *testing.B, s *Server, path string) {
	b.Helper()
	r := httptest.NewRequest("GET", site(path), nil)
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		w := httptest.NewRecorder()
		s.ServeHTTP(w, r)
		if w.Code != http.StatusOK {
			b.Fatalf("%s: %d", path, w.Code)
		}
	}
}

func BenchmarkAppletFile(b *testing.B) {
	s := realSite(b)
	a := s.applets()[0]
	get(b, s, a.URL(a.Src))
}

func BenchmarkDesktop3Win(b *testing.B) {
	s := realSite(b)
	get(b, s, threeWindows(b, s))
}

func BenchmarkTree(b *testing.B) {
	s := realSite(b)
	get(b, s, "/api/site/tree")
}

// TestBudgets holds the benchmarks to budgets well above what they take on
// a laptop, so a change that makes a request do far more work than it
// should (rendering every page, reading every manifest, building the page
// data once per window) fails here. The race detector and -short skip it.
func TestBudgets(t *testing.T) {
	if testing.Short() || raceEnabled {
		t.Skip("budgets are measured without -short and without the race detector")
	}
	for name, c := range map[string]struct {
		bench  func(*testing.B)
		budget time.Duration
	}{
		"AppletFile":  {BenchmarkAppletFile, 2 * time.Millisecond},
		"Desktop3Win": {BenchmarkDesktop3Win, 25 * time.Millisecond},
		"Tree":        {BenchmarkTree, 15 * time.Millisecond},
	} {
		r := testing.Benchmark(c.bench)
		if r.N == 0 {
			t.Fatalf("%s did not run", name)
		}
		per := time.Duration(r.NsPerOp())
		t.Logf("%s: %v per request, %d allocations", name, per, r.AllocsPerOp())
		if per > c.budget {
			t.Errorf("%s takes %v, over its budget of %v", name, per, c.budget)
		}
	}
}
