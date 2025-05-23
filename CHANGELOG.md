# Changelog for server

## [Unreleased](https://github.com/modbus2mqtt/server/tree/HEAD)

[Full Changelog](https://github.com/modbus2mqtt/server/compare/v0.16.26...HEAD)

**Implemented enhancements:**

- \[BUG\] TCP-Connection not kept alive [\#32](https://github.com/modbus2mqtt/server/issues/32)

**Closed issues:**

- Timeout after docker restart [\#107](https://github.com/modbus2mqtt/server/issues/107)
- Error on starting the add-on [\#89](https://github.com/modbus2mqtt/server/issues/89)
- \[BUG\] Variable Properties -\> Unit of Measurement -\> Referenced Entity not selectable [\#87](https://github.com/modbus2mqtt/server/issues/87)
- \[BUG\] no latest-tag on docker image [\#86](https://github.com/modbus2mqtt/server/issues/86)

**Merged pull requests:**

- Modbus RTU Bridge: One configured RTU \(Mod\)bus can be used as Modbus TCP slave [\#120](https://github.com/modbus2mqtt/server/pull/120) ([volkmarnissen](https://github.com/volkmarnissen))
- \[Feature\] Add number of processed calls to Modbus Status [\#119](https://github.com/modbus2mqtt/server/pull/119) ([volkmarnissen](https://github.com/volkmarnissen))
- \[Feature\] Add number of processed calls to Modbus Status [\#118](https://github.com/modbus2mqtt/server/pull/118) ([volkmarnissen](https://github.com/volkmarnissen))
- Add debug message queue length [\#117](https://github.com/modbus2mqtt/server/pull/117) ([volkmarnissen](https://github.com/volkmarnissen))
- Trigger new build to add tcp bridge port to hassio [\#116](https://github.com/modbus2mqtt/server/pull/116) ([volkmarnissen](https://github.com/volkmarnissen))
- \[bug\]Modbus Error Handling, Slave Specification Detection, TCP RTU bridge, Fixes [\#115](https://github.com/modbus2mqtt/server/pull/115) ([volkmarnissen](https://github.com/volkmarnissen))
- \[bug\]Modbus Error Handling, Slave Specification Detection, TCP RTU bridge, Fixes [\#114](https://github.com/modbus2mqtt/server/pull/114) ([volkmarnissen](https://github.com/volkmarnissen))
- No Internet access, Poll [\#113](https://github.com/modbus2mqtt/server/pull/113) ([volkmarnissen](https://github.com/volkmarnissen))
- \[bug\]Modbus Error Handling, Slave Specification Detection, TCP RTU bridge, Fixes [\#112](https://github.com/modbus2mqtt/server/pull/112) ([volkmarnissen](https://github.com/volkmarnissen))
- Modbus Error Handling and Monitoring/tree/modbuscache [\#110](https://github.com/modbus2mqtt/server/pull/110) ([volkmarnissen](https://github.com/volkmarnissen))
- Fix Modbuscache, Add caching for modbusRTU [\#108](https://github.com/modbus2mqtt/server/pull/108) ([volkmarnissen](https://github.com/volkmarnissen))
- Modbuscache [\#106](https://github.com/modbus2mqtt/server/pull/106) ([modbus2mqtt](https://github.com/modbus2mqtt))

## [v0.16.26](https://github.com/modbus2mqtt/server/tree/v0.16.26) (2025-04-14)

[Full Changelog](https://github.com/modbus2mqtt/server/compare/v0.16.25...v0.16.26)

**Closed issues:**

- Add-on "removed from repository" notification [\#100](https://github.com/modbus2mqtt/server/issues/100)

**Merged pull requests:**

- Modbuscache [\#105](https://github.com/modbus2mqtt/server/pull/105) ([volkmarnissen](https://github.com/volkmarnissen))
- introduce junit reports for test output [\#104](https://github.com/modbus2mqtt/server/pull/104) ([volkmarnissen](https://github.com/volkmarnissen))
- Disable failing test [\#103](https://github.com/modbus2mqtt/server/pull/103) ([volkmarnissen](https://github.com/volkmarnissen))
- Jest coverage report and markdown preparation [\#102](https://github.com/modbus2mqtt/server/pull/102) ([volkmarnissen](https://github.com/volkmarnissen))
- Add ModbusCache draft. Not productive [\#101](https://github.com/modbus2mqtt/server/pull/101) ([volkmarnissen](https://github.com/volkmarnissen))
- Update introduction.md [\#99](https://github.com/modbus2mqtt/server/pull/99) ([modbus2mqtt](https://github.com/modbus2mqtt))
- Adding test to check if specifications with discrete inputs and coils… [\#98](https://github.com/modbus2mqtt/server/pull/98) ([arturmietek](https://github.com/arturmietek))
- rename backendTCP Test because it's failing [\#97](https://github.com/modbus2mqtt/server/pull/97) ([volkmarnissen](https://github.com/volkmarnissen))
- rename backendTCP Test because it's failing [\#96](https://github.com/modbus2mqtt/server/pull/96) ([volkmarnissen](https://github.com/volkmarnissen))
- Modbus2mqtt [\#95](https://github.com/modbus2mqtt/server/pull/95) ([volkmarnissen](https://github.com/volkmarnissen))
- Fix BackendTCP [\#94](https://github.com/modbus2mqtt/server/pull/94) ([volkmarnissen](https://github.com/volkmarnissen))
- Fix BackendTCP [\#93](https://github.com/modbus2mqtt/server/pull/93) ([volkmarnissen](https://github.com/volkmarnissen))
- Added status page for modbus errors per slave, cypress tests [\#92](https://github.com/modbus2mqtt/server/pull/92) ([volkmarnissen](https://github.com/volkmarnissen))
- Adding discrete inputs, rewriten logic for writing registers [\#88](https://github.com/modbus2mqtt/server/pull/88) ([arturmietek](https://github.com/arturmietek))

## [v0.16.25](https://github.com/modbus2mqtt/server/tree/v0.16.25) (2025-01-16)

[Full Changelog](https://github.com/modbus2mqtt/server/compare/v0.16.24...v0.16.25)

**Merged pull requests:**

- v0.16.25: Fix decimal places: Passing unchanged value to payload [\#85](https://github.com/modbus2mqtt/server/pull/85) ([volkmarnissen](https://github.com/volkmarnissen))

## [v0.16.24](https://github.com/modbus2mqtt/server/tree/v0.16.24) (2025-01-15)

[Full Changelog](https://github.com/modbus2mqtt/server/compare/v0.16.23...v0.16.24)

**Closed issues:**

- HA discovery messages are published without retain flag [\#82](https://github.com/modbus2mqtt/server/issues/82)
- Number precision missing in HA [\#81](https://github.com/modbus2mqtt/server/issues/81)
- \[BUG\] changing UOM doesn't work via GUI [\#80](https://github.com/modbus2mqtt/server/issues/80)
- \[BUG\] Variable Properties -\> Unit of Measurement -\> Referenced Entity not selectable [\#79](https://github.com/modbus2mqtt/server/issues/79)

**Merged pull requests:**

- v0.16.24: Fix package.json [\#84](https://github.com/modbus2mqtt/server/pull/84) ([volkmarnissen](https://github.com/volkmarnissen))
- Fixes [\#83](https://github.com/modbus2mqtt/server/pull/83) ([volkmarnissen](https://github.com/volkmarnissen))

## [v0.16.23](https://github.com/modbus2mqtt/server/tree/v0.16.23) (2025-01-02)

[Full Changelog](https://github.com/modbus2mqtt/server/compare/v0.16.22...v0.16.23)

**Closed issues:**

- Unable to read uint23 [\#70](https://github.com/modbus2mqtt/server/issues/70)

**Merged pull requests:**

- MQTT: Fix sending ModbusValues parsing errors [\#77](https://github.com/modbus2mqtt/server/pull/77) ([volkmarnissen](https://github.com/volkmarnissen))

## [v0.16.22](https://github.com/modbus2mqtt/server/tree/v0.16.22) (2025-01-02)

[Full Changelog](https://github.com/modbus2mqtt/server/compare/v0.16.21...v0.16.22)

**Merged pull requests:**

- v0.16.21 Add int32 and unsigned int 32 [\#76](https://github.com/modbus2mqtt/server/pull/76) ([volkmarnissen](https://github.com/volkmarnissen))

## [v0.16.21](https://github.com/modbus2mqtt/server/tree/v0.16.21) (2024-12-31)

[Full Changelog](https://github.com/modbus2mqtt/server/compare/v0.16.20...v0.16.21)

**Merged pull requests:**

- v0.16.21 [\#75](https://github.com/modbus2mqtt/server/pull/75) ([volkmarnissen](https://github.com/volkmarnissen))

## [v0.16.20](https://github.com/modbus2mqtt/server/tree/v0.16.20) (2024-12-30)

[Full Changelog](https://github.com/modbus2mqtt/server/compare/v0.16.19...v0.16.20)

**Merged pull requests:**

- v0.16.20 [\#74](https://github.com/modbus2mqtt/server/pull/74) ([volkmarnissen](https://github.com/volkmarnissen))

## [v0.16.19](https://github.com/modbus2mqtt/server/tree/v0.16.19) (2024-12-29)

[Full Changelog](https://github.com/modbus2mqtt/server/compare/v0.16.18...v0.16.19)

**Implemented enhancements:**

- standalone Docker Version [\#25](https://github.com/modbus2mqtt/server/issues/25)

**Closed issues:**

- Update Modbus \<=\> MQTT from 0.16.16 to version 0.16.17 fails [\#71](https://github.com/modbus2mqtt/server/issues/71)
- Addon cannot start after github token expiration [\#68](https://github.com/modbus2mqtt/server/issues/68)

**Merged pull requests:**

- v0.16.19: Fix poll issue [\#73](https://github.com/modbus2mqtt/server/pull/73) ([volkmarnissen](https://github.com/volkmarnissen))

## [v0.16.18](https://github.com/modbus2mqtt/server/tree/v0.16.18) (2024-12-28)

[Full Changelog](https://github.com/modbus2mqtt/server/compare/v0.16.17...v0.16.18)

## [v0.16.17](https://github.com/modbus2mqtt/server/tree/v0.16.17) (2024-12-28)

[Full Changelog](https://github.com/modbus2mqtt/server/compare/v0.16.16...v0.16.17)

**Closed issues:**

- Crash on new 0.16.16 version [\#67](https://github.com/modbus2mqtt/server/issues/67)

**Merged pull requests:**

- Remove npm Dependency from server [\#72](https://github.com/modbus2mqtt/server/pull/72) ([modbus2mqtt](https://github.com/modbus2mqtt))
- root Topic, web service, precision, MQTT Discovery fixes [\#69](https://github.com/modbus2mqtt/server/pull/69) ([volkmarnissen](https://github.com/volkmarnissen))

## [v0.16.16](https://github.com/modbus2mqtt/server/tree/v0.16.16) (2024-12-13)

[Full Changelog](https://github.com/modbus2mqtt/server/compare/v0.16.15...v0.16.16)

**Implemented enhancements:**

- \[FEAT\] support for special values in Number registers [\#36](https://github.com/modbus2mqtt/server/issues/36)

**Fixed bugs:**

- Template variable warning: 'dict object' has no attribute 'ch3c1currentvalue' when rendering '{{ value\_json.ch3c1currentvalue }}' [\#63](https://github.com/modbus2mqtt/server/issues/63)

**Closed issues:**

- Set Unit of measurement for selected device classes [\#62](https://github.com/modbus2mqtt/server/issues/62)
- Add MQTT qos to discovery and subscription [\#61](https://github.com/modbus2mqtt/server/issues/61)

**Merged pull requests:**

- Fix cypress test [\#66](https://github.com/modbus2mqtt/server/pull/66) ([volkmarnissen](https://github.com/volkmarnissen))
- value template, decimal places and fixes for mqtt discovery, contribution [\#65](https://github.com/modbus2mqtt/server/pull/65) ([volkmarnissen](https://github.com/volkmarnissen))

## [v0.16.15](https://github.com/modbus2mqtt/server/tree/v0.16.15) (2024-12-11)

[Full Changelog](https://github.com/modbus2mqtt/server/compare/v0.16.14...v0.16.15)

**Closed issues:**

- Set Github Personal Token in Addon Scenario not possible [\#59](https://github.com/modbus2mqtt/server/issues/59)

**Merged pull requests:**

- Hassio addon [\#64](https://github.com/modbus2mqtt/server/pull/64) ([volkmarnissen](https://github.com/volkmarnissen))

## [v0.16.14](https://github.com/modbus2mqtt/server/tree/v0.16.14) (2024-11-22)

[Full Changelog](https://github.com/modbus2mqtt/server/compare/v0.16.13...v0.16.14)

**Merged pull requests:**

- Fixes for MQTT discovery and minor UI changes [\#60](https://github.com/modbus2mqtt/server/pull/60) ([volkmarnissen](https://github.com/volkmarnissen))

## [v0.16.13](https://github.com/modbus2mqtt/server/tree/v0.16.13) (2024-11-19)

[Full Changelog](https://github.com/modbus2mqtt/server/compare/v0.16.12...v0.16.13)

**Merged pull requests:**

- Fix e2e Test [\#58](https://github.com/modbus2mqtt/server/pull/58) ([volkmarnissen](https://github.com/volkmarnissen))
- Fix e2e test [\#57](https://github.com/modbus2mqtt/server/pull/57) ([volkmarnissen](https://github.com/volkmarnissen))
- E2e Test [\#56](https://github.com/modbus2mqtt/server/pull/56) ([volkmarnissen](https://github.com/volkmarnissen))
- E2e Test [\#55](https://github.com/modbus2mqtt/server/pull/55) ([volkmarnissen](https://github.com/volkmarnissen))
- Fix e2e test [\#54](https://github.com/modbus2mqtt/server/pull/54) ([volkmarnissen](https://github.com/volkmarnissen))
- Fix e2e Test [\#53](https://github.com/modbus2mqtt/server/pull/53) ([volkmarnissen](https://github.com/volkmarnissen))
- Fix e2e test [\#52](https://github.com/modbus2mqtt/server/pull/52) ([volkmarnissen](https://github.com/volkmarnissen))
- Fix e2e test [\#51](https://github.com/modbus2mqtt/server/pull/51) ([volkmarnissen](https://github.com/volkmarnissen))
- Fix e2e test [\#50](https://github.com/modbus2mqtt/server/pull/50) ([volkmarnissen](https://github.com/volkmarnissen))
- Fix 2e2e test [\#49](https://github.com/modbus2mqtt/server/pull/49) ([volkmarnissen](https://github.com/volkmarnissen))
- Fix e2e test [\#48](https://github.com/modbus2mqtt/server/pull/48) ([volkmarnissen](https://github.com/volkmarnissen))
- Fix e2e Test [\#47](https://github.com/modbus2mqtt/server/pull/47) ([volkmarnissen](https://github.com/volkmarnissen))
- Fix package.json [\#46](https://github.com/modbus2mqtt/server/pull/46) ([volkmarnissen](https://github.com/volkmarnissen))
- Fix for signed int16 data, Restore public version in specifications, Update validation messages after modbus value change [\#45](https://github.com/modbus2mqtt/server/pull/45) ([volkmarnissen](https://github.com/volkmarnissen))

## [v0.16.12](https://github.com/modbus2mqtt/server/tree/v0.16.12) (2024-11-15)

[Full Changelog](https://github.com/modbus2mqtt/server/compare/v0.16.11...v0.16.12)

**Fixed bugs:**

- Standalone docker container: No registration of user possible [\#26](https://github.com/modbus2mqtt/server/issues/26)

**Closed issues:**

- Conflict with zigbee2mqtt - zigbee devices disappears [\#40](https://github.com/modbus2mqtt/server/issues/40)
- \[Manufacturer related\] Unable to use negative temperatures [\#39](https://github.com/modbus2mqtt/server/issues/39)
- \[FEAT\] Set availability of datapoint based on config-value [\#35](https://github.com/modbus2mqtt/server/issues/35)
- \[BUG\] Measurements missing "state\_class: measurement" [\#34](https://github.com/modbus2mqtt/server/issues/34)
- \[BUG\] Poll Interval not shown on creating slave [\#33](https://github.com/modbus2mqtt/server/issues/33)
- \[FEAT\] disable auth [\#31](https://github.com/modbus2mqtt/server/issues/31)
- \[FEAT\] support anonymous mqtt-connection [\#30](https://github.com/modbus2mqtt/server/issues/30)

**Merged pull requests:**

- Check all user services after reset [\#44](https://github.com/modbus2mqtt/server/pull/44) ([volkmarnissen](https://github.com/volkmarnissen))
- MQTT discovery state\_class, logon/MQTT no authentication [\#43](https://github.com/modbus2mqtt/server/pull/43) ([volkmarnissen](https://github.com/volkmarnissen))
- Merge pull request \#2 from modbus2mqtt/main [\#42](https://github.com/modbus2mqtt/server/pull/42) ([volkmarnissen](https://github.com/volkmarnissen))
- Add cypress tests in ci [\#41](https://github.com/modbus2mqtt/server/pull/41) ([volkmarnissen](https://github.com/volkmarnissen))

## [v0.16.11](https://github.com/modbus2mqtt/server/tree/v0.16.11) (2024-10-26)

[Full Changelog](https://github.com/modbus2mqtt/server/compare/v0.16.10...v0.16.11)

**Merged pull requests:**

- Fix for Hassio addon logon should not be required [\#29](https://github.com/modbus2mqtt/server/pull/29) ([volkmarnissen](https://github.com/volkmarnissen))

## [v0.16.10](https://github.com/modbus2mqtt/server/tree/v0.16.10) (2024-10-26)

[Full Changelog](https://github.com/modbus2mqtt/server/compare/v0.16.9...v0.16.10)

**Closed issues:**

- Unable to download local setting zip [\#23](https://github.com/modbus2mqtt/server/issues/23)
- Number is not updated, when value changes in home assistant [\#22](https://github.com/modbus2mqtt/server/issues/22)
- Uploaded image files are not visible in specification image gallery [\#21](https://github.com/modbus2mqtt/server/issues/21)
- Version 0.16.8 bus poll error [\#20](https://github.com/modbus2mqtt/server/issues/20)

**Merged pull requests:**

- Fix for hassio Addon [\#28](https://github.com/modbus2mqtt/server/pull/28) ([volkmarnissen](https://github.com/volkmarnissen))
- Fixes: standalone container: register user was not allowed [\#27](https://github.com/modbus2mqtt/server/pull/27) ([volkmarnissen](https://github.com/volkmarnissen))

## [v0.16.9](https://github.com/modbus2mqtt/server/tree/v0.16.9) (2024-10-23)

[Full Changelog](https://github.com/modbus2mqtt/server/compare/v0.16.8...v0.16.9)

**Merged pull requests:**

- Add step property for Discovery, fix modbus TCP, Fix file uploads, fix authentication [\#24](https://github.com/modbus2mqtt/server/pull/24) ([volkmarnissen](https://github.com/volkmarnissen))

## [v0.16.8](https://github.com/modbus2mqtt/server/tree/v0.16.8) (2024-10-16)

[Full Changelog](https://github.com/modbus2mqtt/server/compare/v0.16.7...v0.16.8)

**Closed issues:**

- Unable to change modbus poll interval [\#17](https://github.com/modbus2mqtt/server/issues/17)
- Unable to start modbus2mqtt on HA - error "MQTT client is not connected" [\#15](https://github.com/modbus2mqtt/server/issues/15)

**Merged pull requests:**

- Fix build issues with octokit [\#19](https://github.com/modbus2mqtt/server/pull/19) ([volkmarnissen](https://github.com/volkmarnissen))
- New Features and fix for tcp/ip timeout [\#18](https://github.com/modbus2mqtt/server/pull/18) ([volkmarnissen](https://github.com/volkmarnissen))

## [v0.16.7](https://github.com/modbus2mqtt/server/tree/v0.16.7) (2024-09-24)

[Full Changelog](https://github.com/modbus2mqtt/server/compare/v0.16.6...v0.16.7)

**Merged pull requests:**

- Add Topics and Payload to select slave UI [\#16](https://github.com/modbus2mqtt/server/pull/16) ([volkmarnissen](https://github.com/volkmarnissen))

## [v0.16.6](https://github.com/modbus2mqtt/server/tree/v0.16.6) (2024-09-16)

[Full Changelog](https://github.com/modbus2mqtt/server/compare/v0.16.5...v0.16.6)

**Closed issues:**

- unable to edit specification [\#13](https://github.com/modbus2mqtt/server/issues/13)
- Default modbus2mqtt.yaml [\#11](https://github.com/modbus2mqtt/server/issues/11)

**Merged pull requests:**

- Hassio addon [\#14](https://github.com/modbus2mqtt/server/pull/14) ([volkmarnissen](https://github.com/volkmarnissen))

## [v0.16.5](https://github.com/modbus2mqtt/server/tree/v0.16.5) (2024-09-06)

[Full Changelog](https://github.com/modbus2mqtt/server/compare/v0.16.4...v0.16.5)

**Merged pull requests:**

- Fixes for Validation, Contribution and Specification Detection [\#12](https://github.com/modbus2mqtt/server/pull/12) ([volkmarnissen](https://github.com/volkmarnissen))

## [v0.16.4](https://github.com/modbus2mqtt/server/tree/v0.16.4) (2024-08-28)

[Full Changelog](https://github.com/modbus2mqtt/server/compare/v0.16.3...v0.16.4)

**Merged pull requests:**

- Fixes for Homeassistant Addon MQTT processing [\#10](https://github.com/modbus2mqtt/server/pull/10) ([volkmarnissen](https://github.com/volkmarnissen))

## [v0.16.3](https://github.com/modbus2mqtt/server/tree/v0.16.3) (2024-08-23)

[Full Changelog](https://github.com/modbus2mqtt/server/compare/v0.16.2...v0.16.3)

**Fixed bugs:**

- Fixes for Unit Tests\(and CI/CD\) [\#9](https://github.com/modbus2mqtt/server/pull/9) ([volkmarnissen](https://github.com/volkmarnissen))

**Merged pull requests:**

- Increment supervisor http request timeout [\#8](https://github.com/modbus2mqtt/server/pull/8) ([volkmarnissen](https://github.com/volkmarnissen))

## [v0.16.2](https://github.com/modbus2mqtt/server/tree/v0.16.2) (2024-08-23)

[Full Changelog](https://github.com/modbus2mqtt/server/compare/v0.16.1...v0.16.2)

**Merged pull requests:**

- When MQTT fails during startup, the server stops is fixed [\#7](https://github.com/modbus2mqtt/server/pull/7) ([volkmarnissen](https://github.com/volkmarnissen))
- Working version of release.py [\#6](https://github.com/modbus2mqtt/server/pull/6) ([volkmarnissen](https://github.com/volkmarnissen))
- Add release.py script [\#5](https://github.com/modbus2mqtt/server/pull/5) ([volkmarnissen](https://github.com/volkmarnissen))

## [v0.16.1](https://github.com/modbus2mqtt/server/tree/v0.16.1) (2024-08-21)

[Full Changelog](https://github.com/modbus2mqtt/server/compare/v0.16.0...v0.16.1)

**Merged pull requests:**

- Add sript for release process [\#4](https://github.com/modbus2mqtt/server/pull/4) ([volkmarnissen](https://github.com/volkmarnissen))
- Homeassistant Addon doesn't start [\#3](https://github.com/modbus2mqtt/server/pull/3) ([volkmarnissen](https://github.com/volkmarnissen))
- Copy rootfs fix [\#2](https://github.com/modbus2mqtt/server/pull/2) ([volkmarnissen](https://github.com/volkmarnissen))

## [v0.16.0](https://github.com/modbus2mqtt/server/tree/v0.16.0) (2024-08-19)

[Full Changelog](https://github.com/modbus2mqtt/server/compare/v0.15.0...v0.16.0)

**Merged pull requests:**

- Added Release Process [\#1](https://github.com/modbus2mqtt/server/pull/1) ([volkmarnissen](https://github.com/volkmarnissen))

## [v0.15.0](https://github.com/modbus2mqtt/server/tree/v0.15.0) (2024-08-16)

[Full Changelog](https://github.com/modbus2mqtt/server/compare/v0.13.0...v0.15.0)

## [v0.13.0](https://github.com/modbus2mqtt/server/tree/v0.13.0) (2024-08-16)

[Full Changelog](https://github.com/modbus2mqtt/server/compare/v0.12.0...v0.13.0)

## [v0.12.0](https://github.com/modbus2mqtt/server/tree/v0.12.0) (2024-08-06)

[Full Changelog](https://github.com/modbus2mqtt/server/compare/v0.11.0...v0.12.0)

## [v0.11.0](https://github.com/modbus2mqtt/server/tree/v0.11.0) (2024-08-05)

[Full Changelog](https://github.com/modbus2mqtt/server/compare/0.10.0...v0.11.0)

## [0.10.0](https://github.com/modbus2mqtt/server/tree/0.10.0) (2024-07-26)

[Full Changelog](https://github.com/modbus2mqtt/server/compare/0.9.0...0.10.0)

## [0.9.0](https://github.com/modbus2mqtt/server/tree/0.9.0) (2024-07-25)

[Full Changelog](https://github.com/modbus2mqtt/server/compare/0.8.0...0.9.0)

## [0.8.0](https://github.com/modbus2mqtt/server/tree/0.8.0) (2024-06-21)

[Full Changelog](https://github.com/modbus2mqtt/server/compare/e10c8d90dae26c00b0dde56c430bab4944c645de...0.8.0)



\* *This Changelog was automatically generated by [github_changelog_generator](https://github.com/github-changelog-generator/github-changelog-generator)*
