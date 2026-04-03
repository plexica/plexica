import{u as C,r as g,g as f,j as e,c as l}from"./index-BwQgcLE_.js";import{w as h}from"./waitForElementMountedOnDom-qpCjLZnq.js";function x(c){const{olRecoveryCodesListId:t,i18n:s}=c,{msgStr:o,isFetchingTranslations:a}=s,{insertScriptTags:d}=C({componentOrHookName:"LoginRecoveryAuthnCodeConfig",scriptTags:[{type:"text/javascript",textContent:()=>`

                    /* copy recovery codes  */
                    function copyRecoveryCodes() {
                        var tmpTextarea = document.createElement("textarea");
                        var codes = document.querySelectorAll("#${t} li");
                        for (i = 0; i < codes.length; i++) {
                            tmpTextarea.value = tmpTextarea.value + codes[i].innerText + "\\n";
                        }
                        document.body.appendChild(tmpTextarea);
                        tmpTextarea.select();
                        document.execCommand("copy");
                        document.body.removeChild(tmpTextarea);
                    }

                    var copyButton = document.getElementById("copyRecoveryCodes");
                    copyButton && copyButton.addEventListener("click", function () {
                        copyRecoveryCodes();
                    });

                    /* download recovery codes  */
                    function formatCurrentDateTime() {
                        var dt = new Date();
                        var options = {
                            month: 'long',
                            day: 'numeric',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: 'numeric',
                            timeZoneName: 'short'
                        };

                        return dt.toLocaleString('en-US', options);
                    }

                    function parseRecoveryCodeList() {
                        var recoveryCodes = document.querySelectorAll("#${t} li");
                        var recoveryCodeList = "";

                        for (var i = 0; i < recoveryCodes.length; i++) {
                            var recoveryCodeLiElement = recoveryCodes[i].innerText;
                            recoveryCodeList += recoveryCodeLiElement + "\\r\\n";
                        }

                        return recoveryCodeList;
                    }

                    function buildDownloadContent() {
                        var recoveryCodeList = parseRecoveryCodeList();
                        var dt = new Date();
                        var options = {
                            month: 'long',
                            day: 'numeric',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: 'numeric',
                            timeZoneName: 'short'
                        };

                        return fileBodyContent =
                            ${JSON.stringify(o("recovery-codes-download-file-header"))} + "\\n\\n" +
                            recoveryCodeList + "\\n" +
                            ${JSON.stringify(o("recovery-codes-download-file-description"))} + "\\n\\n" +
                            ${JSON.stringify(o("recovery-codes-download-file-date"))} + " " + formatCurrentDateTime();
                    }

                    function setUpDownloadLinkAndDownload(filename, text) {
                        var el = document.createElement('a');
                        el.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
                        el.setAttribute('download', filename);
                        el.style.display = 'none';
                        document.body.appendChild(el);
                        el.click();
                        document.body.removeChild(el);
                    }

                    function downloadRecoveryCodes() {
                        setUpDownloadLinkAndDownload('kc-download-recovery-codes.txt', buildDownloadContent());
                    }

                    var downloadButton = document.getElementById("downloadRecoveryCodes");
                    downloadButton && downloadButton.addEventListener("click", downloadRecoveryCodes);

                    /* print recovery codes */
                    function buildPrintContent() {
                        var recoveryCodeListHTML = document.getElementById('${t}').innerHTML;
                        var styles =
                            \`@page { size: auto;  margin-top: 0; }
                            body { width: 480px; }
                            div { list-style-type: none; font-family: monospace }
                            p:first-of-type { margin-top: 48px }\`;

                        return printFileContent =
                            "<html><style>" + styles + "</style><body>" +
                            "<title>kc-download-recovery-codes</title>" +
                            "<p>" + ${JSON.stringify(o("recovery-codes-download-file-header"))} + "</p>" +
                            "<div>" + recoveryCodeListHTML + "</div>" +
                            "<p>" + ${JSON.stringify(o("recovery-codes-download-file-description"))} + "</p>" +
                            "<p>" + ${JSON.stringify(o("recovery-codes-download-file-date"))} + " " + formatCurrentDateTime() + "</p>" +
                            "</body></html>";
                    }

                    function printRecoveryCodes() {
                        var w = window.open();
                        w.document.write(buildPrintContent());
                        w.print();
                        w.close();
                    }

                    var printButton = document.getElementById("printRecoveryCodes");
                    printButton && printButton.addEventListener("click", printRecoveryCodes);
                `}]});g.useEffect(()=>{a||(async()=>(await h({elementId:t}),d()))()},[a])}function w(c){const{kcContext:t,i18n:s,doUseDefaultCss:o,Template:a,classes:d}=c,{kcClsx:n}=f({doUseDefaultCss:o,classes:d}),{recoveryAuthnCodesConfigBean:u,isAppInitiatedAction:v}=t,{msg:r,msgStr:m}=s,y="kc-recovery-codes-list";return x({olRecoveryCodesListId:y,i18n:s}),e.jsxs(a,Object.assign({kcContext:t,i18n:s,doUseDefaultCss:o,classes:d,headerNode:r("recovery-code-config-header")},{children:[e.jsxs("div",Object.assign({className:l("pf-c-alert","pf-m-warning","pf-m-inline",n("kcRecoveryCodesWarning")),"aria-label":"Warning alert"},{children:[e.jsx("div",Object.assign({className:"pf-c-alert__icon"},{children:e.jsx("i",{className:"pficon-warning-triangle-o","aria-hidden":"true"})})),e.jsxs("h4",Object.assign({className:"pf-c-alert__title"},{children:[e.jsx("span",Object.assign({className:"pf-screen-reader"},{children:"Warning alert:"})),r("recovery-code-config-warning-title")]})),e.jsx("div",Object.assign({className:"pf-c-alert__description"},{children:e.jsx("p",{children:r("recovery-code-config-warning-message")})}))]})),e.jsx("ol",Object.assign({id:y,className:n("kcRecoveryCodesList")},{children:u.generatedRecoveryAuthnCodesList.map((i,p)=>e.jsxs("li",{children:[e.jsxs("span",{children:[p+1,":"]})," ",i.slice(0,4),"-",i.slice(4,8),"-",i.slice(8)]},p))})),e.jsxs("div",Object.assign({className:n("kcRecoveryCodesActions")},{children:[e.jsxs("button",Object.assign({id:"printRecoveryCodes",className:l("pf-c-button","pf-m-link"),type:"button"},{children:[e.jsx("i",{className:"pficon-print","aria-hidden":"true"})," ",r("recovery-codes-print")]})),e.jsxs("button",Object.assign({id:"downloadRecoveryCodes",className:l("pf-c-button","pf-m-link"),type:"button"},{children:[e.jsx("i",{className:"pficon-save","aria-hidden":"true"})," ",r("recovery-codes-download")]})),e.jsxs("button",Object.assign({id:"copyRecoveryCodes",className:l("pf-c-button","pf-m-link"),type:"button"},{children:[e.jsx("i",{className:"pficon-blueprint","aria-hidden":"true"})," ",r("recovery-codes-copy")]}))]})),e.jsxs("div",Object.assign({className:n("kcFormOptionsClass")},{children:[e.jsx("input",{className:n("kcCheckInputClass"),type:"checkbox",id:"kcRecoveryCodesConfirmationCheck",name:"kcRecoveryCodesConfirmationCheck",onChange:i=>{document.getElementById("saveRecoveryAuthnCodesBtn").disabled=!i.target.checked}}),e.jsx("label",Object.assign({htmlFor:"kcRecoveryCodesConfirmationCheck"},{children:r("recovery-codes-confirmation-message")}))]})),e.jsxs("form",Object.assign({action:t.url.loginAction,className:n("kcFormGroupClass"),id:"kc-recovery-codes-settings-form",method:"post"},{children:[e.jsx("input",{type:"hidden",name:"generatedRecoveryAuthnCodes",value:u.generatedRecoveryAuthnCodesAsString}),e.jsx("input",{type:"hidden",name:"generatedAt",value:u.generatedAt}),e.jsx("input",{type:"hidden",id:"userLabel",name:"userLabel",value:m("recovery-codes-label-default")}),e.jsx(b,{kcClsx:n,i18n:s}),v?e.jsxs(e.Fragment,{children:[e.jsx("input",{type:"submit",className:n("kcButtonClass","kcButtonPrimaryClass","kcButtonLargeClass"),id:"saveRecoveryAuthnCodesBtn",value:m("recovery-codes-action-complete"),disabled:!0}),e.jsx("button",Object.assign({type:"submit",className:n("kcButtonClass","kcButtonDefaultClass","kcButtonLargeClass"),id:"cancelRecoveryAuthnCodesBtn",name:"cancel-aia",value:"true"},{children:r("recovery-codes-action-cancel")}))]}):e.jsx("input",{type:"submit",className:n("kcButtonClass","kcButtonPrimaryClass","kcButtonBlockClass","kcButtonLargeClass"),id:"saveRecoveryAuthnCodesBtn",value:m("recovery-codes-action-complete"),disabled:!0})]}))]}))}function b(c){const{kcClsx:t,i18n:s}=c,{msg:o}=s;return e.jsx("div",Object.assign({id:"kc-form-options",className:t("kcFormOptionsClass")},{children:e.jsx("div",Object.assign({className:t("kcFormOptionsWrapperClass")},{children:e.jsx("div",Object.assign({className:"checkbox"},{children:e.jsxs("label",{children:[e.jsx("input",{type:"checkbox",id:"logout-sessions",name:"logout-sessions",value:"on",defaultChecked:!0}),o("logoutOtherSessions")]})}))}))}))}export{w as default};
