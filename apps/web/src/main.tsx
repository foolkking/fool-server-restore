import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Bell, CheckCircle2, ChevronDown, LogOut, Languages, Search, Settings, Trash2, UserRound, X } from "lucide-react";
import {
  connectServer,
  deleteConnection,
  fetchCatalog,
  fetchCatalogGuide,
  fetchConnections,
  fetchCurrentUser,
  fetchMigrationStrategies,
  fetchProfiles,
  reprobeConnection,
  updateConnection,
  updateProfile,
  uploadVmSnapshot,
  fetchSshKeys,
  confirmPasswordReset,
  deleteInboxMessage,
  fetchInboxMessages,
  fetchInboxUnreadCount,
  markInboxRead,
  type AgentProbeResult,
  type AuthUser,
  type CatalogGuide,
  type CatalogItem,
  type ConnectionProfile,
  type CurrentUser,
  type ExecutionTask,
  type InboxMessage,
  type MigrationStrategy,
  type SshKeyMeta,
  type UserProfile
} from "./api";
import { text, navItems, type Locale, type Page } from "./lib/types";
import { MachinePage } from "./pages/MachinePage";
import { MarketPage } from "./pages/MarketPage";
import { MePage } from "./pages/MePage";
import { PlaybookPage } from "./pages/PlaybookPage";
import { SettingsPage } from "./pages/SettingsPage";
import { fetchPlaybooks, type StoredPlaybook } from "./api";
import { TerminalPanel } from "./components/TerminalPanel";
import { MarkdownOverlay } from "./components/MarkdownOverlay";
import { OnboardingWizard } from "./components/OnboardingWizard";
import "./styles.css";

type ConnectionMethod = "ssh-password" | "ssh-key";

function App() {
  const [locale, setLocale] = useState<Locale>("zh");
  const [page, setPage] = useState<Page>("machine");
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [userPlaybooks, setUserPlaybooks] = useState<StoredPlaybook[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [strategies, setStrategies] = useState<MigrationStrategy[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [guide, setGuide] = useState<CatalogGuide | null>(null);
  const [query, setQuery] = useState("");
  const [catalogKind, setCatalogKind] = useState<"software" | "combo" | "suggest">("software");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [inboxMessages, setInboxMessages] = useState<InboxMessage[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxError, setInboxError] = useState("");
  const [inboxUnreadCount, setInboxUnreadCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const [method, setMethod] = useState<ConnectionMethod>("ssh-password");
  
  // 闂傚倸鍊搁崐鎼佸磹妞嬪海鐭嗗〒姘ｅ亾妤犵偞鐗犻、鏇㈡晝閳ь剛澹曡ぐ鎺撶厽闁绘梻鍘ф禍浼存煟閺傛寧顥為柟渚垮妼椤啰鎷犻煫顓烆棜闂佽崵濮崇拃锕傚垂閸洖钃熸繛鎴欏灩缁犳盯姊婚崼鐔衡姇闁诲繐绉瑰娲传閸曨剙顎涢梺鍛婃尰瀹€鎼佺嵁閸儱惟闁靛娴烽崰鏍х暦缁嬭鏃堝焵椤掑嫬绠洪柣銏犳啞閳锋垿鏌涘┑鍡楊仾妞ゃ儲绮庣槐鎺旂磼濡搫顫掑┑鐘亾濞达絿纭堕弨浠嬫煟濡鍤嬬€规悶鍎甸弻娑㈡偆娴ｉ晲鍠婂銈冨灪椤ㄥ﹥鎱ㄩ埀顒勬煏閸繃顥滃ù鐘叉惈椤啴濡堕崱娆忣潷濠殿喗菧閸旀垵鐣峰ú顏呮櫜闁搞儻绲芥禍楣冩偡濞嗗繐顏紒鈧崘鈺傚弿婵☆垳顭堟慨鍌涱殽閻愭潙鐏寸€规洜鍠栭、娑樷槈濞嗗繐濮冮梻浣藉吹閸犳劙鎮烽妷褉鍋撳顒€妲绘い顓炴喘婵＄兘鍩￠崒妤佸濠电偠鎻紞鈧い顐㈩樀婵＄敻鎮㈤崗鑲╁幈闂佺粯顭堝▍鏇犵矆閸喓绠鹃柛鈩冨姇閻忊晜銇勯锝囩畼闁圭懓瀚叅妞ゅ繐鎷戠槐顒勬⒒閸屾瑧顦﹂柟璇х磿缂傛捇宕稿Δ鈧壕璺ㄢ偓瑙勬礀濞层倝藟濮樿埖鐓熼柟浼存涧閸橀潧霉濠婂嫮鐭掗柡宀嬬節瀹曟﹢濡搁敂鑺ュ€锋俊鐐€戦崕杈╃矓瑜版帒钃熸繛鎴欏灩缁犲鏌涘Δ鍐ㄤ粶妞ゎ剙顑囩槐鎾存媴娴犲鎽甸柣銏╁灲缁绘繈鎮伴鈧畷鍫曨敆婢跺娅嶉柣鐔哥矊闁帮綁骞冩ィ鍐╁亗閹煎瓨蓱閺傗偓闂備胶绮崝妯间焊濞嗘劖娅犳繛鎴欏灪閻撴洟鏌曟繛鍨姕闁稿鍎查〃銉╂倷閹绘帗娈婚梺绯曟櫔缁绘繂鐣烽妸鈺婃晩闁稿繗鍋愰弶铏圭磽閸屾瑧顦﹀褑濮ら弲璺何旈崨顔芥珨婵?
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const [authUser, setAuthUser] = useState<AuthUser | null>(() => {
    try {
      const saved = localStorage.getItem("envforge_user");
      return saved ? JSON.parse(saved) as AuthUser : null;
    } catch { return null; }
  });
  const [authToken, setAuthToken] = useState(() => localStorage.getItem("envforge_token") ?? "");
  const [sshKeys, setSshKeys] = useState<SshKeyMeta[]>([]);

  async function reloadInbox() {
    if (!authToken) {
      setInboxMessages([]);
      setInboxUnreadCount(0);
      return;
    }
    setInboxLoading(true);
    setInboxError("");
    try {
      const [result, unread] = await Promise.all([
        fetchInboxMessages(authToken, undefined, 30),
        fetchInboxUnreadCount(authToken)
      ]);
      setInboxMessages(result.messages);
      setInboxUnreadCount(unread);
    } catch (error) {
      setInboxError(error instanceof Error ? error.message : "Inbox failed");
    } finally {
      setInboxLoading(false);
    }
  }

  useEffect(() => {
    void reloadInbox();
  }, [authToken]);

  async function handleMarkInboxRead(messageId: string) {
    if (!authToken) return;
    await markInboxRead(authToken, messageId);
    setInboxMessages((messages) => messages.map((message) => message.id === messageId ? { ...message, isRead: true } : message));
    setInboxUnreadCount((count) => Math.max(0, count - 1));
  }

  async function handleDeleteInboxMessage(messageId: string) {
    if (!authToken) return;
    const deleted = inboxMessages.find((message) => message.id === messageId);
    await deleteInboxMessage(authToken, messageId);
    setInboxMessages((messages) => messages.filter((message) => message.id !== messageId));
    if (deleted && !deleted.isRead) setInboxUnreadCount((count) => Math.max(0, count - 1));
  }
  const [connectionProfile, setConnectionProfile] = useState<ConnectionProfile | null>(null);
  const [connections, setConnections] = useState<ConnectionProfile[]>([]);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState("");
  const [probeResult, setProbeResult] = useState<AgentProbeResult | null>(null);
  const [probing, setProbing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);
  const [activeTask, setActiveTask] = useState<ExecutionTask | null>(null);
  const [terminalLogs, setTerminalLogs] = useState<Array<{ time: string; type: "info" | "success" | "error" | "cmd"; text: string }>>([]);
  const t = text[locale];

  const activeConnection = connections.find((c) => c.id === activeConnectionId) ?? connectionProfile ?? null;
  const activeProbe = (activeConnection?.probeSnapshot as AgentProbeResult | undefined) ?? probeResult;

  function pushLog(type: "info" | "success" | "error" | "cmd", text: string) {
    setTerminalLogs((prev) => [...prev.slice(-200), { time: new Date().toLocaleTimeString(), type, text }]);
  }

  useEffect(() => {
    void load();
    void handleAuthLandingFragments();
    if (authToken) {
      fetch("/api/auth/session", { headers: { Authorization: `Bearer ${authToken}` } })
        .then((res) => {
          if (!res.ok) {
            setAuthToken("");
            setAuthUser(null);
            localStorage.removeItem("envforge_token");
            localStorage.removeItem("envforge_user");
          }
        })
        .catch(() => { /* offline, keep local state */ });
    }
  }, []);

  async function handleAuthLandingFragments() {
    const url = new URL(window.location.href);
    const fragment = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    const fragParams = new URLSearchParams(fragment);

    // 1. OAuth callback (regular login)
    const oauthToken = fragParams.get("token");
    if (oauthToken && !fragParams.has("2fa") && !fragParams.has("enroll")) {
      try {
        const res = await fetch("/api/auth/session", {
          headers: { Authorization: `Bearer ${oauthToken}` }
        });
        if (res.ok) {
          const body = await res.json() as { user: AuthUser };
          handleAuthSuccess({ token: oauthToken, user: body.user });
          history.replaceState(null, "", url.origin + url.pathname);
          return;
        }
      } catch { /* fall through */ }
    }

    // 2. OAuth callback signaling TOTP gate
    const intermediate = fragParams.get("intermediateToken");
    if (fragParams.has("2fa") && intermediate) {
      localStorage.setItem("envforge_pending_2fa", intermediate);
      history.replaceState(null, "", url.origin + url.pathname);
      setPage("me");
      return;
    }

    // 3. OAuth callback for admin-enrollment
    if (fragParams.has("enroll") && oauthToken) {
      localStorage.setItem("envforge_enrollment_token", oauthToken);
      history.replaceState(null, "", url.origin + url.pathname);
      alert(locale === "zh"
        ? "Admin accounts must enable 2FA in Settings > Account."
        : "Admin accounts must enable 2FA before continuing.");
      setPage("settings");
      return;
    }

    // 4. OAuth link success callback
    const oauthLinked = url.searchParams.get("oauth") === "linked" || fragParams.get("oauth") === "linked";
    if (oauthLinked) {
      const provider = url.searchParams.get("provider") || fragParams.get("provider") || "OAuth";
      alert(locale === "zh"
        ? `${provider} account linked successfully.`
        : `${provider} account linked successfully!`);
      history.replaceState(null, "", url.origin + "/");
      setPage("settings");
      return;
    }

    // 5. OAuth error
    const oauthError = url.searchParams.get("oauth_error") || fragParams.get("oauth_error");
    if (oauthError) {
      const conflictEmail = url.searchParams.get("email") || fragParams.get("email");
      const msg = oauthError === "email_conflict"
        ? (locale === "zh"
          ? `Email ${conflictEmail ?? ""} is already registered. Sign in with password first, then link this provider in settings.`
          : `The email ${conflictEmail ?? ""} is already registered. Sign in with your password first, then link the provider from settings.`)
        : (locale === "zh"
          ? `Login failed (${oauthError}).`
          : `Login failed (${oauthError}).`);
      alert(msg);
      history.replaceState(null, "", url.origin + "/");
      return;
    }

    // 5. Password reset confirm landing (濠电姷鏁告慨鐑藉极閹间礁纾块柟瀵稿Т缁躲倝鏌﹀Ο渚＆鐟滅増甯掔壕濂告煟閹邦垰鐨洪柣娑栧劚閳规垶骞婇柛濠冩礋楠炲﹥鎯旈妸銉ュ殤婵炶揪绲跨涵鍫曞绩娴犲鐓曢悘鐐插⒔椤ｆ煡鏌涢悢鍝勪槐闁哄本绋掔换婵嬪礋椤愩垹绠ｉ梻浣告惈閻绱為埀顒併亜閿旂晫鍙€闁哄瞼鍠栭幊鐐哄Ψ瑜忛悡鍌滅磽娓氬洤娅欑紒鎻掆偓鐔轰簷闂備線鈧偛鑻晶瀛樼節閳ь剚绗熼埀顒€顫忓ú顏勭閹艰揪绲块悾鐢告⒑缂佹﹩娈旈柨鏇畱閳藉鎮界粙鍧楀敹闂佸搫娲ㄩ崰鎾诲储閸涘﹦绠鹃弶鍫濆⒔缁夘喗绻涙担鍐叉搐閻掑灚銇勯幒宥堝厡缂佺姷鍋為〃銉╂倷閹绘帗娈婚梺绯曟櫔缁绘繂鐣烽妸鈺婃晩闁稿繗鍋愰弶铏圭磽閸屾瑧顦﹀褑濮ら弲璺何旈崨顔芥珨婵犵數鍋涢悺銊у垝瀹ュ纾块柟鎯板Г缁犳帡姊绘担鐟邦嚋缂佽鍊哥叅闁挎洖鍊搁崥褰掓煃瑜滈崜姘辨崲濞戞埃鍋撻悽娈跨劸閺嶏繝姊洪幐搴㈢８闁搞劏妫勯锝囨嫚濞村顫嶉梺闈涚箳婵兘顢欐繝鍥ㄢ拺闁告繂瀚婵嬫煕閻樿櫕宕屽┑鈩冩尦楠炲洭鎮ч崼姘闂備胶顭堢换鎰板触鐎ｎ剛绀婇柟杈鹃檮閻撱儵鏌￠崶鏈电盎妞も晩鍓熼弻娑㈠箳閹捐櫕璇為梺杞扮劍閸旀瑥鐣烽妸鈺佺＜婵炴垶鐟㈤幏濠氭⒑闁偛鑻晶鍓х磽瀹ュ懏顥㈢€规洘绮岄埥澶愬煑閸濆嫭鍠樻い銏″哺閸┾偓妞ゆ巻鍋撴い顐㈢箰鐓ゆい蹇撳椤ρ囨⒑缁嬭法绠洪柛瀣姍瀹曟瑩鍩勯崘顏嗙槇闂傚倸鐗婄粙鎴﹀焵椤掑倹鍤€妞ゎ偄绻橀幊锟犲Χ閸涱厾浜版俊鐐€栭幐楣冨窗鎼达絾顐介柣鎰劋閻撴瑩姊洪銊х暠濠⒀屽枤閳?window.prompt)
    const urlResetToken = url.searchParams.get("token");
    if (url.pathname.startsWith("/auth/password-reset") && urlResetToken) {
      setResetToken(urlResetToken); // 婵犵數濮烽弫鍛婃叏閻戣棄鏋侀柛娑橈攻閸欏繘鏌ｉ幋婵愭綗闁逞屽墮閸婂湱绮嬮幒鏂哄亾閿濆簼绨介柨娑欑洴濮婅櫣鎲撮崟顐㈠Б濡炪倖娲﹂崢鍓у垝缂佹ǜ鍋呴柛鎰ㄦ櫇閸樼偓绻濋棃娑樷偓鍛婄珶婵犲洤绾ф繛宸簼閻撴洟鏌曢崼婵囶棤闁瑰啿娲弻锛勪沪鐠囨祴鍋撳┑鍡╁殨闁割偅娲栫粻锝嗐亜閺嶃劏澹樻い顐ゅХ缁?
      history.replaceState(null, "", url.origin + "/"); // 闂傚倸鍊搁崐鎼佸磹瀹勬噴褰掑炊椤掑﹦绋忔繝銏ｅ煐閸旀洜澹曢崹顔规斀闁稿瞼鍋炴禍銈囩磽瀹ュ棛澧い顓℃硶閹瑰嫰鎮滃Ο缁樺闂備礁鎼Λ娆戝垝閹捐钃?URL 闂傚倸鍊搁崐鎼佸磹妞嬪海鐭嗗〒姘ｅ亾妤犵偛顦甸弫鎾绘偐閸愯弓鐢婚梻渚€娼чˇ顐﹀疾濞戞艾顥氶柛锔诲幗閸犳劙鏌ｅΔ鈧悧鍡欑箔閹烘挻鍙忛悷娆忓閸欌偓闂佸搫鐭夌紞浣割嚕椤掑嫬鍨傛い鏃囨閳ь剦鍨跺娲箮閼恒儲鏆犻梺鍦嚀濞差厼顕ｇ拠娴嬫婵☆垶鏀遍悗濠氭椤愩垺绁紒鏌ョ畺閸┿垽骞樼紒妯锋嫼闂佸憡绋戦敃銉ョ暦瀹€鈧槐鎺楁偐瀹曞洤鈷岄悗娈垮枦椤曆囧煡婢舵劕顫呴柣妯活問閸炵儤绻濆閿嬫緲閳ь剚鎹囬幃鐐烘晝閸屾碍杈堥梺缁橆焽缁垶鍩涢幋锔界厱婵犻潧妫楅顒勬倵濮橆偄宓嗛柡灞诲姂瀵挳濡搁妶澶婁粣闁诲孩顔栭崰娑樼暦閸偆顩烽柨鏂垮⒔妞规娊鎮楅敐搴濈凹闁稿鍨跺缁樻媴閸涘﹤鏆堢紓渚囧枛閻楁捇骞冮悙鐑樻櫆閻犳亽鍔嶅Σ鈧梻鍌氬€峰ù鍥敋瑜忛埀顒佺▓閺呯娀銆佸▎鎾冲唨妞ゆ挾鍋熼悰銉╂⒑閸濆嫯鐧佺€广儱鐗冮崑鎾诲锤濡や讲鎷哄銈嗗坊閸嬫挾绱掓径灞炬毈鐎?
      return;
    }
  }

  async function load(token?: string) {
    const [catalogResult, userResult] = await Promise.allSettled([
      fetchCatalog(),
      fetchCurrentUser()
    ]);
    const strategyResult = await fetchMigrationStrategies().catch(() => []);
    if (catalogResult.status === "fulfilled") setCatalog(catalogResult.value);
    if (userResult.status === "fulfilled") setCurrentUser(userResult.value);
    setStrategies(strategyResult);
    if (token) {
      void fetchPlaybooks(token).then(setUserPlaybooks).catch(() => setUserPlaybooks([]));
    }

    const activeToken = token ?? authToken;
    if (activeToken) {
      const [conns, profs, keys] = await Promise.all([
        fetchConnections(activeToken).catch(() => [] as ConnectionProfile[]),
        fetchProfiles(activeToken).catch(() => [] as UserProfile[]),
        fetchSshKeys(activeToken).catch(() => [] as SshKeyMeta[])
      ]);
      setConnections(conns);
      setUserProfiles(profs);
      setSshKeys(keys);
    }
  }

  async function handleScan() {
    if (!authToken || !activeConnectionId) return;
    pushLog("cmd", `ssh reprobe -> ${activeConnectionId}`);
    pushLog("info", "Re-collecting system info via SSH...");
    try {
      const updated = await reprobeConnection(authToken, activeConnectionId);
      setConnections((prev) => prev.map((c) => c.id === updated.id ? updated : c));
      if (updated.probeSnapshot) {
        setProbeResult(updated.probeSnapshot as AgentProbeResult);
        const sw = updated.probeSnapshot.software?.length ?? 0;
        pushLog("success", locale === "zh"
          ? `Scan complete: ${sw} packages at ${new Date(updated.probeSnapshot.collectedAt).toLocaleTimeString()}`
          : `Collection done: ${sw} packages at ${new Date(updated.probeSnapshot.collectedAt).toLocaleTimeString()}`);
      } else {
        pushLog("error", locale === "zh" ? "Collection failed: no data returned" : "Collection failed: no data returned");
      }
    } catch (err) {
      pushLog("error", err instanceof Error ? err.message : "Scan failed");
    }
  }

  async function handleConnect(fields: Record<string, string>, agentUrl: string) {
    setConnectionError("");
    setProbing(true);
    if (!authToken) {
      setConnectionError(locale === "zh" ? "Please login before saving a server connection." : "Please login before saving a server connection.");
      setProbing(false);
      return;
    }

    const host = fields.host || "unknown";
    const port = fields.port || "22";
    const user = fields.username || "root";
    pushLog("cmd", `ssh ${user}@${host}:${port}`);
    pushLog("info", locale === "zh" ? `Connecting via SSH to ${host}:${port}...` : `Connecting via SSH to ${host}:${port}...`);

    try {
      const result = await connectServer({
        token: authToken,
        method,
        label: fields.host || fields.contextName || method,
        fields: Object.fromEntries(Object.entries(fields).filter(([k]) => k !== "_keyId")),
        keyId: fields._keyId || undefined
      });
      setConnectionProfile(result.connection);
      setActiveConnectionId(result.connection.id);
      setConnected(true);
      if (result.probe) {
        setProbeResult(result.probe as AgentProbeResult);
        const sw = result.probe.software?.length ?? 0;
        pushLog("success", locale === "zh"
          ? `SSH connected. Collected ${sw} packages.`
          : `SSH connected! Collected ${sw} packages.`);
        pushLog("info", `hostname: ${result.probe.system.hostname}, OS: ${result.probe.system.platform} ${result.probe.system.arch}`);
      } else if (result.connection.status === "ssh_failed") {
        pushLog("error", `SSH failed: ${result.connection.sshError ?? "unknown error"}`);
      } else {
        pushLog("info", locale === "zh" ? "Connection saved (no data collected)" : "Connection saved (no data collected)");
      }
      const conns = await fetchConnections(authToken).catch(() => connections);
      setConnections(conns);
    } catch (error) {
      setConnected(false);
      const msg = error instanceof Error ? error.message : "Connection failed";
      setConnectionError(msg);
      pushLog("error", msg);
    } finally {
      setProbing(false);
    }
  }

  async function handleReprobe(connectionId: string) {
    if (!authToken) return;
    const conn = connections.find((c) => c.id === connectionId);
    const host = conn?.fields?.host ?? "unknown";
    pushLog("cmd", `ssh reprobe -> ${host}`);
    pushLog("info", locale === "zh" ? `Re-probing ${host}...` : `Re-probing ${host}...`);
    setProbing(true);
    try {
      const updated = await reprobeConnection(authToken, connectionId);
      setConnections((prev) => prev.map((c) => c.id === updated.id ? updated : c));
      if (updated.probeSnapshot) {
        setProbeResult(updated.probeSnapshot as AgentProbeResult);
        const sw = updated.probeSnapshot.software?.length ?? 0;
        pushLog("success", locale === "zh"
          ? `Done: ${sw} packages at ${new Date(updated.probeSnapshot.collectedAt).toLocaleTimeString()}`
          : `Done: ${sw} packages at ${new Date(updated.probeSnapshot.collectedAt).toLocaleTimeString()}`);
      } else {
        pushLog("error", updated.sshError ?? (locale === "zh" ? "Probe failed" : "Probe failed"));
      }
    } catch (err) {
      pushLog("error", err instanceof Error ? err.message : "Reprobe failed");
    } finally {
      setProbing(false);
    }
  }

  async function handleDeleteConnection(id: string) {
    if (!authToken) return;
    try {
      await deleteConnection(authToken, id);
      setConnections((prev) => prev.filter((c) => c.id !== id));
      if (activeConnectionId === id) {
        setActiveConnectionId(null);
        setConnected(false);
        setProbeResult(null);
        setConnectionProfile(null);
      }
    } catch { /* silent */ }
  }

  async function handleUpdateConnection(id: string, input: { label?: string; agentUrl?: string }) {
    if (!authToken) return;
    try {
      const updated = await updateConnection(authToken, id, input);
      setConnections((prev) => prev.map((c) => c.id === id ? updated : c));
    } catch { /* silent */ }
  }

  function handleAuthSuccess(result: { token: string; user: AuthUser }) {
    setAuthToken(result.token);
    setAuthUser(result.user);
    setShowOnboarding(localStorage.getItem("envforge_onboarded") !== "1");
    localStorage.setItem("envforge_token", result.token);
    localStorage.setItem("envforge_user", JSON.stringify(result.user));
    void load(result.token);
  }

  function handleLogout() {
    setAccountMenuOpen(false);
    setAuthToken("");
    setAuthUser(null);
    setConnected(false);
    setConnectionProfile(null);
    setUserProfiles([]);
    localStorage.removeItem("envforge_token");
    localStorage.removeItem("envforge_user");
    setPage("me");
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filteredCatalog = useMemo(() => {
    const lower = query.trim().toLowerCase();
    if (catalogKind === "suggest") return [];
    return catalog.filter((item) => {
      const matchesKind = item.kind === catalogKind;
      const matchesQuery =
        !lower ||
        [item.name, item.nameEn, item.summary, item.summaryEn, item.category]
          .join(" ")
          .toLowerCase()
          .includes(lower);
      return matchesKind && matchesQuery;
    });
  }, [catalog, catalogKind, query]);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">E</div>
          <div>
            <strong>{t.appName}</strong>
            <span>{t.subtitle}</span>
          </div>
        </div>

        <nav className="main-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button className={page === item.id ? "active" : ""} key={item.id} type="button" onClick={() => setPage(item.id)}>
                <Icon aria-hidden />
                <span>{t[item.id]}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          {page === "market" ? (
            <label className="search-box">
              <Search aria-hidden />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} />
            </label>
          ) : (
            <div>
              <p className="eyebrow">{page === "machine" ? t.connection : page === "playbooks" ? "IaC" : t.me}</p>
              <h1>{t[page]}</h1>
            </div>
          )}

          <div className="top-actions">
            <button className="ghost-action" type="button" onClick={() => setLocale(locale === "zh" ? "en" : "zh")}>
              <Languages aria-hidden />
              {t.language}
            </button>
            {authUser ? (
              <button className="inbox-button" type="button" onClick={() => { setInboxOpen(true); void reloadInbox(); }} aria-label={locale === "zh" ? "站内信" : "Inbox"}>
                <Bell aria-hidden />
                {inboxUnreadCount > 0 ? <span>{inboxUnreadCount > 99 ? "99+" : inboxUnreadCount}</span> : null}
              </button>
            ) : null}
            <div className="account-menu-wrap">
              <button className="avatar-button" type="button" onClick={() => setAccountMenuOpen((value) => !value)} aria-expanded={accountMenuOpen}>
                <span className="avatar">{authUser ? authUser.name.slice(0, 1).toUpperCase() : "G"}</span>
                <ChevronDown aria-hidden />
              </button>
              {accountMenuOpen ? (
                <div className="account-menu" role="menu">
                  <div className="account-menu-card">
                    <span className="avatar small">{authUser ? authUser.name.slice(0, 1).toUpperCase() : "G"}</span>
                    <div>
                      <strong>{authUser?.displayName || authUser?.name || "Guest"}</strong>
                      <span>{authUser?.email || "Not signed in"}</span>
                    </div>
                  </div>
                  <button type="button" onClick={() => { setPage("me"); setAccountMenuOpen(false); }}>
                    <UserRound aria-hidden /> {locale === "zh" ? "My space" : "My space"}
                  </button>
                  <button type="button" onClick={() => { setPage("settings"); setAccountMenuOpen(false); }}>
                    <Settings aria-hidden /> {locale === "zh" ? "Settings" : "Settings"}
                  </button>
                  {authUser ? (
                    <button type="button" onClick={handleLogout}>
                      <LogOut aria-hidden /> {locale === "zh" ? "Sign out" : "Sign out"}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </header>

        {inboxOpen ? (
          <div className="inbox-drawer" role="dialog" aria-label={locale === "zh" ? "站内信" : "Inbox"}>
            <div className="inbox-drawer-header">
              <div>
                <h2>{locale === "zh" ? "站内信" : "Inbox"}</h2>
                <p>{locale === "zh" ? `${inboxUnreadCount} 条未读消息` : `${inboxUnreadCount} unread messages`}</p>
              </div>
              <button className="icon-action" type="button" onClick={() => setInboxOpen(false)} aria-label="Close inbox">
                <X aria-hidden />
              </button>
            </div>
            {inboxError ? <p className="connection-error">{inboxError}</p> : null}
            {inboxLoading ? (
              <p className="empty-hint">{locale === "zh" ? "正在加载站内信..." : "Loading inbox..."}</p>
            ) : inboxMessages.length === 0 ? (
              <p className="empty-hint">{locale === "zh" ? "暂无站内信。" : "No messages yet."}</p>
            ) : (
              <ul className="inbox-list">
                {inboxMessages.map((message) => (
                  <li className={message.isRead ? "inbox-item" : "inbox-item unread"} key={message.id}>
                    <div>
                      <strong>{message.title}</strong>
                      <p>{message.content}</p>
                      <time>{new Date(message.createdAt).toLocaleString()}</time>
                    </div>
                    <div className="inbox-item-actions">
                      {!message.isRead ? (
                        <button className="icon-action" type="button" onClick={() => void handleMarkInboxRead(message.id)} title={locale === "zh" ? "标为已读" : "Mark read"}>
                          <CheckCircle2 aria-hidden />
                        </button>
                      ) : null}
                      <button className="icon-action danger" type="button" onClick={() => void handleDeleteInboxMessage(message.id)} title={locale === "zh" ? "删除" : "Delete"}>
                        <Trash2 aria-hidden />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {page === "machine" ? (
          <MachinePage
            t={t}
            locale={locale}
            connections={connections}
            activeConnectionId={activeConnectionId}
            selected={selected}
            connected={connected}
            connectionProfile={connectionProfile}
            connectionError={connectionError}
            probeResult={activeProbe ?? null}
            probing={probing}
            method={method}
            onMethod={setMethod}
            onConnect={handleConnect}
            onSelectConnection={(id) => {
              setActiveConnectionId(id);
              const conn = connections.find((c) => c.id === id);
              if (conn?.probeSnapshot) {
                setProbeResult(conn.probeSnapshot as AgentProbeResult);
                setConnected(true);
                pushLog("info", `Selected: ${conn.label} (${conn.fields.host})`);
              } else {
                setConnected(true);
                setProbeResult(null);
                pushLog("info", `Selected: ${conn?.label ?? id} (no cached data, click reprobe)`);
              }
            }}
            onReprobe={handleReprobe}
            onToggle={toggleSelected}
            onScan={handleScan}
            onUploadSnapshot={async (input) => {
              if (!activeConnectionId || !authToken) return;
              const profile = await uploadVmSnapshot(authToken, activeConnectionId, input);
              setUserProfiles((prev) => [profile, ...prev]);
            }}
            authUser={authUser}
            authToken={authToken}
            sshKeys={sshKeys}
            onSshKeysChange={setSshKeys}
            onDeleteConnection={handleDeleteConnection}
            onUpdateConnection={handleUpdateConnection}
            pushLog={pushLog}
          />
        ) : null}

        {page === "market" ? (
          <MarketPage
            t={t}
            locale={locale}
            items={filteredCatalog}
            selected={selected}
            kind={catalogKind}
            onKind={setCatalogKind}
            onOpenGuide={async (id) => setGuide(await fetchCatalogGuide(id))}
            onToggle={toggleSelected}
            authToken={authToken}
            activeConnectionId={activeConnectionId}
            activeTask={activeTask}
            onTaskUpdate={setActiveTask}
          />
        ) : null}

        {page === "me" ? (
          <MePage
            t={t}
            locale={locale}
            user={currentUser}
            authUser={authUser}
            authToken={authToken}
            strategies={strategies}
            userProfiles={userProfiles}
            onAuthSuccess={(result) => handleAuthSuccess(result)}
            onUpdateProfile={async (input) => {
              const user = await updateProfile({ token: authToken, ...input });
              setAuthUser(user);
            }}
            onLogout={() => {
              setAuthToken("");
              setAuthUser(null);
              setConnected(false);
              setConnectionProfile(null);
              setUserProfiles([]);
              localStorage.removeItem("envforge_token");
              localStorage.removeItem("envforge_user");
            }}
            onProfilesChange={(profiles) => setUserProfiles(profiles)}
            activeConnectionId={activeConnectionId}
          />
        ) : null}

        {page === "playbooks" ? (
          <PlaybookPage
            locale={locale}
            authToken={authToken}
            connections={connections}
            activeTask={activeTask}
            onTaskUpdate={setActiveTask}
          />
        ) : null}

        {page === "settings" && authUser && authToken ? (
          <SettingsPage
            locale={locale}
            authToken={authToken}
            connections={connections}
            playbooks={userPlaybooks}
            catalog={catalog}
            isAdmin={authUser.role === "admin"}
          />
        ) : page === "settings" ? (
          <p className="empty-hint">Login to access settings.</p>
        ) : null}

        {guide ? <MarkdownOverlay guide={guide} locale={locale} authToken={authToken} onClose={() => setGuide(null)} /> : null}
        {showOnboarding ? <OnboardingWizard locale={locale} onClose={() => setShowOnboarding(false)} /> : null}
      </section>

      {connected ? (
        <TerminalPanel
          locale={locale}
          activeTask={activeTask}
          activeConnection={activeConnection}
          terminalLogs={terminalLogs}
          onClose={() => setActiveTask(null)}
        />
      ) : null}

      {resetToken ? (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", justifyContent: "center", alignItems: "center" }}>
          <div className="modal-content" style={{ background: "#fff", padding: "24px", borderRadius: "8px", minWidth: "320px", boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }}>
            <h3 style={{ marginTop: 0, marginBottom: "16px", fontSize: "18px" }}>Enter new password</h3>
            <p style={{ fontSize: "14px", color: "#64748b", marginBottom: "12px" }}>At least 8 characters</p>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password..." style={{ width: "100%", padding: "10px", marginBottom: "20px", border: "1px solid #cbd5e1", borderRadius: "4px", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button type="button" className="ghost-action" onClick={() => { setResetToken(null); setNewPassword(""); }}>Cancel</button>
              <button type="button" className="primary-action" onClick={async () => {
                if (newPassword.length < 8) { alert("Password must be at least 8 characters."); return; }
                try {
                  await confirmPasswordReset({ token: resetToken, newPassword });
                  alert("Password reset. Please sign in.");
                  setResetToken(null);
                  setNewPassword("");
                } catch (err) {
                  alert(err instanceof Error ? err.message : "Reset failed");
                }
              }}>Confirm Reset</button>
            </div>
          </div>
        </div>
      ) : null}

    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
