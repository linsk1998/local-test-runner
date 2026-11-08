import type { Plugin } from "../../../types/ServeOptions";

// 注入到测试页的结果上报脚本。
// 除 total/passed/runtime 外，还收集失败断言明细（测试名/消息/期望/实际），
// 以 fail0..failN 字段一并 POST 回服务器。
// 保持 ES3 兼容：不用 JSON、不用 ES5，IE6+ / Firefox1.5+ / 老 Presto Opera 可用。
const apiScript = `
(function(){
var fails = [];
var current = '';
function fmt(v){
	var t;
	try { t = String(v); } catch(e) { t = '?'; }
	if(t.length > 300) { t = t.substring(0, 300) + '...'; }
	return t;
}
function onTestStart(t){ current = (t && t.name) || ''; }
function onLog(d){
	if(d && d.result === false){
		fails.push(current + ' :: ' + fmt(d.message) + ' (expected: ' + fmt(d.expected) + ', actual: ' + fmt(d.actual) + ')');
	}
}
function finish(result){
	setTimeout(function(){
		var form = document.createElement('form');
		form.method = 'POST';
		form.action = '/';
		form.style.display = 'none';
		function add(name, value){
			var input = document.createElement('input');
			input.name = name;
			input.value = value;
			form.appendChild(input);
		}
		add('total', result.total);
		add('passed', result.passed);
		add('runtime', result.runtime);
		add('failures', fails.length);
		for(var i = 0; i < fails.length && i < 50; i++){ add('fail' + i, fails[i]); }
		document.body.appendChild(form);
		form.submit();
	}, 500);
}
// QUnit 2.x 有 QUnit.version，支持 QUnit.done(callback) 注册；
// QUnit 1.x 没有 version，且它的 runLoggingCallbacks 会优先直接调用 QUnit.done/log/testStart，
// 注册式回调根本不会被遍历到，只能覆盖赋值。
if(QUnit.version){
	QUnit.testStart(onTestStart);
	QUnit.log(onLog);
	QUnit.done(finish);
} else {
	QUnit.testStart = onTestStart;
	QUnit.log = onLog;
	QUnit.done = finish;
}
})();
`;

export var QUnit: Plugin = {
	transformHtml() {
		return [{
			injectTo: 'body',
			tag: 'script',
			children: apiScript
		}];
	}
};
