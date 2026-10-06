<!DOCTYPE html>
<!-- page:exodus -->
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ASUS Wireless Router — Exodus</title>
<link rel="stylesheet" href="/index_style.css"><link rel="stylesheet" href="/form_style.css">
<link rel="stylesheet" href="/ext/exodus/style.css">
<!-- Firmware jQuery includes jQuery Migrate: load its UMD bundle before RequireJS. -->
<script src="/js/jquery.js"></script>
<script src="/state.js"></script><script src="/general.js"></script>
<script src="/popup.js"></script><script src="/help.js"></script>
<script src="/js/httpApi.js"></script>
<script>window.ExodusBootstrap = {lang: '<% nvram_get("preferred_lang"); %>'}; function done_validating() { /* Responses are polled; preserve the draft. */ }</script>
</head><body onload="show_menu();">
<div id="TopBanner"></div><div id="Loading" class="popup_bg"></div>
<iframe name="hidden_frame" id="hidden_frame" hidden></iframe>
<iframe name="exodus_apply_frame" id="exodus_apply_frame" hidden></iframe>
<form id="exodus_apply" method="post" action="/start_apply.htm" target="exodus_apply_frame">
<input type="hidden" name="action_mode" value="apply">
<input type="hidden" name="flag" value="background">
<input type="hidden" name="action_script" value="restart_exodus_ui">
<input type="hidden" name="action_wait" value="1">
<input type="hidden" name="current_page"><input type="hidden" name="next_page">
<input type="hidden" name="amng_custom">
</form>
<table class="content" align="center" cellpadding="0" cellspacing="0"><tr>
<td width="17" valign="top"></td><td width="202" valign="top"><div id="mainMenu"></div><div id="subMenu"></div></td>
<td valign="top"><div id="tabMenu" class="submenuBlock"></div>
<main id="exodus-root" class="FormTitle">
<div class="exodus-heading"><div class="brand"><span id="brand-mark" class="brand-mark" aria-hidden="true"></span><div class="brand-copy"><strong>Exodus</strong><span id="workspace-label"></span></div></div><button id="about" class="btn btn-ghost btn-icon" type="button" aria-label="About"></button></div>
<div id="session-warning" class="alert alert-warning" role="alert" hidden></div>
<nav id="menu" class="nav" aria-label="Exodus"></nav><div id="savebar" class="savebar" hidden></div><div id="content" tabindex="-1"></div>
<div id="toaster" class="toaster" aria-live="polite"></div>
<div id="dialog" class="dialog-overlay" hidden></div>
</main></td><td width="10"></td></tr></table><div id="footer"></div>
<script src="/ext/exodus/i18n.js"></script><script src="/ext/exodus/merlin.js"></script><script src="/ext/exodus/app.js"></script>
</body></html>
