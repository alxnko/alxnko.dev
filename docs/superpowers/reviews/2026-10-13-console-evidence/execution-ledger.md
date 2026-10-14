# SDD ledger — plan: docs/superpowers/plans/2026-10-13-console-intro.md

User approved written console direction and supplied six review clarifications on 2026-10-13. Incorporate them; no further design check-in needed. Shipping skill grants merge after all gates, deployment authority exists earlier in session but planned distinct postmerge check. Root owns merge gate.

| Tasks | Shared contract / self-consistency | Result |
|---|---|---|
| 1+2 | index imports bakedMaterial; night-only shader change preserves API | Compatible; root owns materials/finalizer/assets, intro worker owns UI/index/tests |
| 1+3 | Root validates real intro and full gate after aggregate sources stabilize | Compatible |
| 2+3 | Manifest hashes/qualities checked under existing budgets | Compatible |
| 1 | Frozen layout + analytic camera + font/render barrier; slow realbrowser tests | Consistent; responsive first layout permitted and then frozen |
| 2 | q96/94 output fits budgets; stable shader dither onlynight | Consistent; no Blender rebake needed |
| 3 | Full gate and committed requirements review before PR; currenttip CI+threads before merge | Consistent |

Baseline: origin/main and main HEAD bc1ef1da3aa9bd64e88985026bdc2161f3ca2ca3. Worktree feat/console-intro copied all prior deployed/uncommitted websitechanges except shots/. Backups /var/tmp/alxnko-ship-20261013/{previous-work.patch,previous-untracked.tar}. Main checkout untouched. Worktree dependencies symlink original node_modules, no packages added.

Baseline slowserver rootdist4330 session56785, proxy4331 session30029 config /var/tmp/alxnko-intro-network.json. Delays sceneJS2s,GLB4s,atlas1s; no cache. T3 tab_2. Before artifacts docs/audit-assets/2026-10-13. Known Cloudflare injected CSP errors are existinghostissues; no CSP relax.

Night candidates /var/tmp/alxnko-night-encoding: q96 2048 272092bytes; q94 1024 108804bytes. Master /var/tmp/alxnko-scene/atlas-night-4096.png from matching GLB2dfcff89. q96MAE .572 vs .984, p95 2 vs4. Preserve day/posters/glb.

Task 1: pending implementer dispatch.
Task 2: pending root implementation.
Task 3: pending fullgate/review/PR/CI/merge.

Baselinecarry commit41b4277 verified26files390unitpass,lint0errors0warnings1existinghint. node_modules symlinkignored (gitignore supports symlink); no dependencyfiles committed. Task1 dispatched console_intro_build worker gpt6.1solhigh; ownsUI/index/tests/page posterpriority. Root implements boundedTask2 natively (ruling: smalltestedencoding+shaderpatch, separate freshtaskreviewstillrequired).
Task2 sources/assets committed,13assetchecks pass. Finalizeronlychangesnightatlasfiles+manifest,all12GLB/day/poster/OGhashes unchanged. q96/q94matches measured272092/108804bytes. Deterministicgradientnoisechecked1440x900: codevaluemin-.999269,max.999459,mean-.000313,hashcorr.0000666. GPUvisual/shaderphasevalidationpendingintrobuild. No opacity/decal/glow/screen changes. No conflicts.

Task2 source review night_task_review: no Critical/Important/Minor; correctinheritance+day+alpha+ratio isolation; runtimeGPU/visual remainsrequired. Rootrawassetintegrityalreadyobserved13contractchecks+12SHAunchanged, willcloseGPUunderfinalbuild. ReviewNOTmergereadyuntilproof. Task1 acceptednarrowpage/index.astro posterpriority/lazyattributes ownership.

Task1 observedfirstslowphonebuild: sameblackterminalreadable,realrain/glbsnewnightshaderloaded; firstdraftinitialJS31.1KiB budgetnotready. Video /home/alxnko/.t3/userdata/attachments/6afb5cca-dbef-416a-8b26-52c1a9abc2b1-a3e81c0f-a33e-4986-9ecb-4e55d5ac25f9-mp4.mp4 ; frame5.5and6.2consolematched,6.6laptopreveal,7desk. Notfinalevidencebecauseworkerstilliterating.
Ruling: quantizedGLBinnerdisplayaspect1.597299 vs16:10 produces2.16CSSpx widthmismatchat1280desktop. Approveanalytictemporarycamera.aspect calibration fromactualworldaspectvsconsoleaspect, tween backnormalviewportaspectduringflight,restoreonallcancel/reduced/fallbackpaths; no hardcodedcorrection orrebake. Testsactualratio+offcenter+realhandoff≤1px. This choosesconsistentcamera+fixedtext overimperceptible0.169%projectionaspect adjustment; costifwrongslightlensdistortionduringreveal.

Ownernewrequestphoto broadensqualitytoobjects/shadowsday+night. SupersedesnoBlenderrebake constraint; spec/planamendedTask3props,shippingnowTask4. Readonlyinspectorconfirmed248unneededhp39–45deg sharpedges duefinal38pass. Newgeometry+bakeworkdir /var/tmp/alxnko-scene-20261013,originalcachepreserved. Task3freshbuilderbriefready,ROOTwillbakeonce. Task1 UI continuesinparallel, aggregatefullgateafternewassetsstable.

Task3 source ba02fcf checked by actual Blender;26180→26820tri,248falsehpcreases→0,112/112hardcaps preserved,flatnormals0degrees,screencoordinatesunchanged. Fresh fullpipeline runningROOTsession72969 withSCENE_KEEP=1,newcache; originalcacheuntouched. Freshprop_source_review reviews4c671a2..ba02fcf. Introheldhandoff12/12realviewportsalreadygreen,edgecases/budgetstillactive,aggregatewaitassets.

Fullfreshpipelineexit0inclimport-check; newGLB31c9396d249936bytes26856tris. Night2048q96266848bytes;1024q94115182bytes. Freshmastercomparisonq82vsq96MAE.9725→.5738,p954→2,darkMAE1.2002→.7663,darkp954→2,1840057darkpixels. Asset13checksagainpass. Prop source reviewer no findings; aggregatevisualstillpending. Introagentnotifiedstableassets/fullgateallowed.

Batchedvisualpass found newdeskfrontdottedrim. Freshreadonly Blenderprobe confirms darkband0.545screenpx/0.571atlastexels; combinedsubpixelgeometry/texture sampling, notisolatedUVcorruption. Rulingretain desk2+weightednormal,stand3/hp24 unchanged. Rootone-linefix(build26740tri) andsecondfullpipeline session31351,newcache /var/tmp/alxnko-scene-20261013-final. Preserve firstnewcacheforregressionproof; finalfullgateaftersecondassets. Specamended measuredexception.

Secondfullpipelineexit0importcheck,newGLB98d1b91b249508bytes26776tri;night2048q96274098bytes. FreshnightcomparisonMAE.95482→.56149,p954→2,dark1.19108→.74938,darkp954→2. Asset13checkspass,assetscommitdbd5094. Originmainfetchstillbc1ef1d. Impeccabledetectoncechanged8UIpaths[];latermarkerchangesrequireactualreviewnotdetectorcertificate. Nativehostexplicitunavailablepermitsheadlessfallback;firstfullUIrun199passed20skip3fail(1realnavfocusrace,2artifactENOENTfromconcurrentownrun). Workerfixingfocus+lateentry15srebootstrap, nofinalfullgreenclaim. RootslowcapturesameDOM/bounds/content0errorsboth,sourcefontusable227/89msundercontrolleddelay,notp50/95. Finalvisualconfirm+fullgatependingstableUIcommit.

Task1source5dfad2acommitted. ROOTwholegate70969exit0:409unit,208browserpass20existingintentionalskips,allbudgets. IndependentTask1review2Importantconfirmed(GPUtimeoutfalse-ready;prefsduringfinalGPUwait stale). Fixround1resumedbuilder; transportcompactionfailpartialreadyhelper+REDunitfilespreserved,resumetriggeredagain. NoPR/push/mergeyet. Pre-reviewgreenlogsarchivedpre-review-gate; nextwholegateafterfixrequired. Finalvisualtableclean,headphonesround,stationaryrenders0bytechange andGLerror0both,slowsameDOM/bounds/content0errorsdesktopmobile.

Task1fixround1commit4db0f60 scopedre-review2/2ADDRESSED,no newbreakage. Freshfullgate419unit allbudgets,but213browserpass20skip1resizeoldbounds1360vs844 (eventtimingunderinvestigation). NativepreviewhostreconnectedAMD760M observedinitial0viewport froze --screen-w2 causingblanklaptop; separateboundedviewportguard+eventtesttriage delegatedfreshviewport_startup_fix withverbatimshippingrequirements,no sourceparallelbuilds. Ruling: unusableinitialviewport keepslite andoffers explicitretry oncevalid; preservehealthyintrogrid. Costifwrong: somehiddenembedvisitsneedexplicit3D ratherthanauto. NoPR/push/mergeyet.

Ruling: startup must reject the authoritative contained rectangle below 256 CSS pixels before freezing, including tiny positive viewports (33/100px), not only zero dimensions — preserves readable lite content and budget by reusing bootstrap activation status — cost if wrong: tiny embedded viewports require explicit 3D retry after becoming usable. All five approved viewports remain eligible.

Resize triage: setViewportSize updated innerWidth before the browser delivered its resize event; repeated diagnostic runs saw old right=1360 then correct right=682.8 after event. Poll the existing containment/frozen-layout assertions until observable resize processing instead of sleeping or weakening geometry tolerance.

Viewport correction committed779ee85,427unit,14browserfocused+20resizerepeatsgreen,initialJS30711/30720bytes. Native240×568 confirmed bootfailed, noinlinegrid/no canvas, invalidmanualattemptbuttonenabled; resize320×568stayedlite; explicitenter3d chose576×360logicalgrid. Rootfullgate99419running serial, preliminarylint/unit/build/budgetgreen. Scopedreviewawaited.

Viewport task: complete (4db0f60..779ee85, spec compliant/taskqualityapproved; noCritical/Important). Cross-task items require rootwholegate, originalpatchcheck andbroadreview. Minor deferred: Node localStorage ExperimentalWarning, Vite largechunk advisory, NO_COLOR/FORCE_COLOR conflict. Samewarningspresentpre-review-gate/{unit,build,e2e}.log; environment/buildtool hygiene is separate from runtimefix, unchanged gzipbudgetpassed.

Root aggregategate99419exit0 on779ee85: lint0errors0warnings1existinghint,427unit,productionbuildCSP,budgetsallgreen,216browserpassed20intentionalSkips236total4.7min. OriginaltrackedpatchSHA256 unchanged300b7379d6185f41b7f6d09c6249233cac2357a0a1f8823522f938583f54a82f; originmainfreshstillbc1ef1d.

Wholebranchreviewbc1ef1d..873b7e4 completed mostcapablefreshastra afterquotaresume; 2Importantconfirmed (staleinlineoverlaygrid afterfallback+resize+retry; abandoneddeskDone+activehold/motor cleanup on disposal), noCritical/newproductMinor. Rootnative independently reproduced first x16y194w640h400right656 at320viewport; source independently confirms second cleanup725/deskDone1089/commandawaitworld59. Onefinalfixwave delegatedfresh final_lifecycle_fix; no new broadreviewafterwave, scopedre-review required. Sixdeclined-tojudge accepted: physicaldevice/distributions cannotcertify; incumbentliveOSpolicyfollowup; existinghostanalyticsCSPoutsidebranch; contentexpansionexcluded; futurershippingrootwillverify; rawtranscriptwhitespace/toolwarningsretainedhonestly.

Root finalwave addendum: confirmed missing__consoleIntro manualactivation setsboot3d beforefalseoptionalcall andstartsno watchdog/controller. Existingblocked-inline testdidnotclickmanualentry. Nativeverifiedcontacts hidden/no canvas/no deadline, sourceentry163–165 confirms. Samecurrentfixwave expandedentry.ts ownership toguardmissingbootstrap+realblockedHTMLmanualclickRED/GREEN; no budgetrelax/newwave. Rootaddendumdurableunderreviews.

Finalwavecommita25ef2d fixesall3verifiedfindings,4ownedfiles. 32scopedbrowserpass2intentionalmousemobileSkip,427units,lint/buildCSP/budgets0. CorrectREDcase moving/busyprecondition+actualpartialscriptlateentry/visiblemanualoffer confirmed. Initial30711/30720;lazy172659/174080. Rootaggregate50518runningserial; freshscopedfinal_fix_review handlesall3against873b7e4..a25ef2d. NoPR/pushyet.

Finalscopedre-review873b7e4..a25ef2d: all3ADDRESSED,no newbreakage/outofscope, no suitesrerun. Rootnative finalretryafterloss+resize320 withmanifestheld nowinlineremoved,root576,logical576×360,bounds16,194,288,180right304≤320 (priorright656). Scenereadyretainsnode/logical576×360,glError0; cameraintrointerruptedso nativepostreadygeometrynotclaimedheldhandoffproof, coveredrealbrowsertestsprovideequality.

Task4 finalrootfullgate50518exit0 ona25ef2d:427unit,229browserpassed21intentionalSkips250total5.5min,lint/buildCSP/allbudgets0. Productsourcefinalfix independentlyapprovedall3closed. Freshoriginmainstillbc1ef1d, no conflicts occurred. Readyforrootpush/PR/currenttipCI+threads/merge; sourcecomplete, publicationpending.
