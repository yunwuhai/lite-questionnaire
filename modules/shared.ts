/**
 * 模块间共享类型
 */

/** 简化的主题接口，各模块渲染函数使用 */
export interface ThemeLike {
  fg: (color: string, text: string) => string;
  bg: (color: string, text: string) => string;
  bold: (text: string) => string;
}
