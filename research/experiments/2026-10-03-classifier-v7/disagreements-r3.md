# Where a yes/no flag and the fact answer disagree (v7.3, training set)

A flag says yes while the fact answer is a different kind, or the fact answer is that kind while its flag says no. Listed for review: each one is either a miss by one of the two questions or an article with two kinds of news. Validation-set disagreements are counted, not listed: {'flag yes, fact differs': 5}.

| Who is right by the key | Flag | Claim | Article | Flag's yes | Fact answered | Key's fact | Title |
|---|---|---|---|---|---|---|---|
| both right (two kinds of news) | health | claim-113 | #1058 | 0.91 | status_update | status_update | Dana White confirmó que Ilia Topuria está listo para pelear  |
| both wrong | health | claim-080 | #620 | 0.65 | status_update | personal_life | Ilia Topuria anuncia su vuelta a la UFC: "Después de visitar |
| both wrong | health | claim-080 | #627 | 0.78 | status_update | personal_life | Topuria Breaks Silence After UFC White House Loss - boxingne |
| both wrong | next_fight | claim-073.0 | #599 | 0.50 | fight_week_event | no_fact | Найважчий бій для Донченка. Що чекає на українця в Парижі |
| fact right, flag wrong | health | claim-080 | #659 | 0.50 | personal_life | personal_life | Topuria rompe su silencio tras la derrota: «Después de visit |
| fact right, flag wrong | health | claim-113 | #1020 | 0.63 | status_update | status_update | La UFC lo confirma: "Ilia Topuria está listo para pelear" -  |
| fact right, flag wrong | health | claim-113 | #1036 | 0.71 | status_update | status_update | Dana White: Ilia Topuria ‘ready to fight’ but no decision ye |
| fact right, flag wrong | health | claim-113 | #972 | 0.74 | status_update | status_update | Dana White reveals Ilia Topuria is ‘ready to fight,’ open to |
| fact right, flag wrong | health | claim-113 | #998 | 0.77 | status_update | status_update | Dana White confirma que Ilia Topuria está de vuelta: "Está l |
| fact right, flag wrong | result | claim-095 | #746 | 0.12 | result | result | Daniil Donchenko Octagon Interview / UFC Paris - UFC.com |
| flag right, fact wrong | health | claim-015.0 | #327 | 0.50 | no_fact | health | Merab Dvalishvili donne des nouvelles d’Ilia Topuria : « Il  |
| flag right, fact wrong | health | claim-015.0 | #349 | 0.84 | status_update | health | Merab actualiza el estado de Topuria: "Está bien y con una a |
| flag right, fact wrong | health | claim-015.0 | #397 | 0.78 | no_fact | health | Merab Dvalishvili, tajante sobre el regreso de Ilia Topuria: |
| flag right, fact wrong | health | claim-015.0 | #402 | 0.89 | status_update | health | Ilia Topuria ya tiene fecha de regreso al octógono tras el c |
| flag right, fact wrong | health | claim-127 | #1172 | 0.86 | no_fact | health | «Я не гірший за Усмана». Донченко – про бій з Камару та укра |
| flag right, fact wrong | next_fight | claim-097 | #803 | 0.66 | no_fact | next_fight | Jon Anik cites potential "internal conversations" in the UFC |
| flag right, fact wrong | next_fight | claim-097 | #807 | 0.54 | no_fact | next_fight | Anik On Gaethje's Next Fight After Topuria Win - boxingnews. |
| flag right, fact wrong | next_fight | claim-097 | #828 | 0.67 | no_fact | next_fight | Jon Anik: UFC Considering Justin Gaethje vs. Ilia Topuria 2  |
| flag right, fact wrong | next_fight | claim-097 | #862 | 0.73 | no_fact | next_fight | Jon Anik: There are 'internal conversations' about a Gaethje |
| flag right, fact wrong | next_fight | claim-099 | #820 | 0.59 | no_fact | next_fight | Pimblett Shoots Down Topuria December Fight Rumor - boxingne |
| flag right, fact wrong | next_fight | claim-099 | #838 | 0.76 | no_fact | next_fight | Paddy Pimblett reacts to rumor he is set to fight Ilia Topur |
