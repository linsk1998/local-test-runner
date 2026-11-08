import type { Plugin } from "../../../types/ServeOptions";

// 注入到测试页的结果上报脚本。
// 监听 Mocha Runner 的 fail / end 事件，把 total / passed / runtime 与失败明细
// 以 fail0..failN 字段 POST 回服务器。
// 保持 ES3 兼容：不用 JSON、不用 ES5，IE6+ / Firefox1.5+ / 老 Presto Opera 可用。
const apiScript = `
(function(){
var fails = [];
var startTime = 0;
function nowTime(){ return new Date().getTime(); }
function fmt(v){
	var t;
	try { t = String(v); } catch(e) { t = '?'; }
	if(t.length > 300) { t = t.substring(0, 300) + '...'; }
	return t;
}
function testTitle(test){
	var title = '';
	try {
		if(test){
			if(typeof test.fullTitle === 'function'){ title = test.fullTitle(); }
			else if(test.title){ title = test.title; }
		}
	} catch(e) {}
	return title || '';
}
function onFail(test, err){
	var msg = '';
	try { msg = (err && (err.message || String(err))) || ''; } catch(e) {}
	fails.push(testTitle(test) + ' :: ' + fmt(msg));
}
function finish(total, passed, runtime){
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
		add('total', total);
		add('passed', passed);
		add('runtime', runtime);
		add('failures', fails.length);
		for(var i = 0; i < fails.length && i < 50; i++){ add('fail' + i, fails[i]); }
		document.body.appendChild(form);
		form.submit();
	}, 500);
}
function attach(runner){
	if(!runner || runner.__localTestRunnerAttached){ return; }
	runner.__localTestRunnerAttached = true;
	var tests = 0;
	var passes = 0;
	runner.on('test end', function(){ tests++; });
	runner.on('pass', function(){ passes++; });
	runner.on('fail', onFail);
	runner.on('end', function(){
		var stats = runner.stats || {};
		var total = stats.tests != null ? stats.tests : tests;
		var passed = stats.passes != null ? stats.passes : passes;
		var runtime = stats.duration;
		if(runtime == null){ runtime = startTime ? (nowTime() - startTime) : 0; }
		finish(total, passed, runtime);
	});
}
// 直接劫持 Runner.prototype.run：Mocha 的同步测试会在 run() 返回前全部跑完，
// 只有在这里提前挂事件，才能拿到完整的 fail / end。
var Runner = window.Mocha && window.Mocha.Runner;
if(Runner && Runner.prototype && typeof Runner.prototype.run === 'function' && !Runner.prototype.__localTestRunnerHooked){
	var origRun = Runner.prototype.run;
	Runner.prototype.run = function(){
		if(!startTime){ startTime = nowTime(); }
		attach(this);
		return origRun.apply(this, arguments);
	};
	Runner.prototype.__localTestRunnerHooked = true;
} else if(window.mocha && typeof mocha.run === 'function'){
	// 兜底：无法劫持 Runner 时，只能捕获 run() 返回之后的异步事件。
	var origMochaRun = mocha.run;
	mocha.run = function(){
		startTime = nowTime();
		var runner = origMochaRun.apply(mocha, arguments);
		attach(runner);
		return runner;
	};
}
})();
`;

export var Mocha: Plugin = {
	transformHtml() {
		return [{
			injectTo: 'body',
			tag: 'script',
			children: apiScript
		}];
	}
};
