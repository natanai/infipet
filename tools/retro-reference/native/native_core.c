/* SPDX-License-Identifier: GPL-2.0-or-later
 * Offline reference harness for TamaLIB, Copyright(C)2021 Jean-Christophe Rona.
 * Snapshot layout adapted from Sagestum/tamagotchi-carebot(src/tama_core.c),
 * GPL-2.0, pinned1ee8f6f1dce394cc88a4cd193dbb0e05793fc66a.
 * No RAM write/poke API. Firmware is supplied in memory and never compiled in.
 */
#include <stdint.h>
#ifdef __wasm__
typedef unsigned long size_t;
void *memcpy(void *dest,const void *source,size_t length){volatile uint8_t *d=dest;const uint8_t *s=source;for(size_t i=0;i<length;i++)d[i]=s[i];return dest;}
void *memset(void *dest,int value,size_t length){volatile uint8_t *d=dest;for(size_t i=0;i<length;i++)d[i]=(uint8_t)value;return dest;}
#else
#include <string.h>
#endif
#include "tamalib.h"
#ifdef _WIN32
#define API __declspec(dllexport)
#else
#define API
#endif
static u12_t program[8192];
static uint8_t matrix[LCD_HEIGHT][LCD_WIDTH], icons[ICON_NUM];
static uint64_t total_ticks;
static uint8_t transfer_buffer[16384];
API uint8_t *native_buffer(void){return transfer_buffer;}
static void *no_alloc(u32_t size){(void)size;return 0;}
static void no_free(void *ptr){(void)ptr;}
static void no_op(void){}
static bool_t no_log(log_level_t level){(void)level;return 0;}
static void ignore_log(log_level_t level,char *text,...){(void)level;(void)text;}
static void no_sleep(timestamp_t time){(void)time;}
static timestamp_t timestamp(void){return 0;}
static void pixel(u8_t x,u8_t y,bool_t value){if(x<LCD_WIDTH&&y<LCD_HEIGHT)matrix[y][x]=value;}
static void icon(u8_t index,bool_t value){if(index<ICON_NUM)icons[index]=value;}
static void frequency(u32_t value){(void)value;}
static void sound(bool_t enabled){(void)enabled;}
static int handler(void){return 0;}
static hal_t hal={.malloc=no_alloc,.free=no_free,.halt=no_op,.is_log_enabled=no_log,
  .log=ignore_log,.sleep_until=no_sleep,.get_timestamp=timestamp,.update_screen=no_op,
  .set_lcd_matrix=pixel,.set_lcd_icon=icon,.set_frequency=frequency,
  .play_frequency=sound,.handler=handler};
API int native_init(const uint8_t *bytes,uint32_t length){
  if(length!=12288)return -1;
  memset(program,0,sizeof(program));
  for(uint32_t i=0;i<length/2;i++)program[i]=((bytes[2*i]&15)<<8)|bytes[2*i+1];
  memset(matrix,0,sizeof(matrix));memset(icons,0,sizeof(icons));total_ticks=0;
  tamalib_register_hal(&hal);
  if(tamalib_init(program,0,1000000))return -2;
  tamalib_set_speed(0);return 0;
}
API int native_run(uint32_t ticks){
  u32_t *counter=cpu_get_state()->tick_counter;u32_t start=*counter;
  while((u32_t)(*counter-start)<ticks){if(cpu_step())return -1;}
  total_ticks+=(u32_t)(*counter-start);return 0;
}
/* Stop at the actual CPU instruction that changes one read-only observed cell. */
API int native_run_watch(uint32_t ticks,uint32_t address,uint8_t previous){
  if(address>=MEMORY_SIZE)return -2;
  state_t *state=cpu_get_state();u32_t *counter=state->tick_counter;u32_t start=*counter;
  while((u32_t)(*counter-start)<ticks){
    if(cpu_step())return -1;
    if(GET_MEMORY(state->memory,address)!=previous){total_ticks+=(u32_t)(*counter-start);return 1;}
  }
  total_ticks+=(u32_t)(*counter-start);return 0;
}
API uint64_t native_ticks(void){return total_ticks;}
API void native_button(int button,int pressed){
  if(button>=0&&button<3)tamalib_set_button((button_t)button,pressed?BTN_STATE_PRESSED:BTN_STATE_RELEASED);
}
API uint8_t native_memory(uint32_t address){
  return address<MEMORY_SIZE?GET_MEMORY(cpu_get_state()->memory,address):0;
}
API void native_frame(uint8_t *out){memcpy(out,matrix,sizeof(matrix));memcpy(out+sizeof(matrix),icons,sizeof(icons));}
#define PUT(v) do{if(pos+sizeof(v)>cap)return 0;memcpy(buf+pos,&(v),sizeof(v));pos+=sizeof(v);}while(0)
#define GET(v) do{if(pos+sizeof(v)>length)return -1;memcpy(&(v),buf+pos,sizeof(v));pos+=sizeof(v);}while(0)
API uint32_t native_save(uint8_t *buf,uint32_t cap){
  state_t *s=cpu_get_state();uint32_t pos=0,magic=0x31465049;
  PUT(magic);PUT(total_ticks);
  PUT(*s->pc);PUT(*s->x);PUT(*s->y);PUT(*s->a);PUT(*s->b);PUT(*s->np);PUT(*s->sp);PUT(*s->flags);
  PUT(*s->tick_counter);PUT(*s->clk_timer_2hz_timestamp);PUT(*s->clk_timer_4hz_timestamp);
  PUT(*s->clk_timer_8hz_timestamp);PUT(*s->clk_timer_16hz_timestamp);PUT(*s->clk_timer_32hz_timestamp);
  PUT(*s->clk_timer_64hz_timestamp);PUT(*s->clk_timer_128hz_timestamp);PUT(*s->clk_timer_256hz_timestamp);
  PUT(*s->prog_timer_timestamp);PUT(*s->prog_timer_enabled);PUT(*s->prog_timer_data);PUT(*s->prog_timer_rld);PUT(*s->call_depth);
  for(int i=0;i<INT_SLOT_NUM;i++){PUT(s->interrupts[i].factor_flag_reg);PUT(s->interrupts[i].mask_reg);PUT(s->interrupts[i].triggered);}
  PUT(*s->cpu_halted);
  if(pos+MEM_BUFFER_SIZE*sizeof(MEM_BUFFER_TYPE)>cap)return 0;
  memcpy(buf+pos,s->memory,MEM_BUFFER_SIZE*sizeof(MEM_BUFFER_TYPE));return pos+MEM_BUFFER_SIZE*sizeof(MEM_BUFFER_TYPE);
}
API int native_load(const uint8_t *buf,uint32_t length){
  state_t *s=cpu_get_state();uint32_t pos=0,magic;
  GET(magic);if(magic!=0x31465049)return -1;
  GET(total_ticks);
  GET(*s->pc);GET(*s->x);GET(*s->y);GET(*s->a);GET(*s->b);GET(*s->np);GET(*s->sp);GET(*s->flags);
  GET(*s->tick_counter);GET(*s->clk_timer_2hz_timestamp);GET(*s->clk_timer_4hz_timestamp);
  GET(*s->clk_timer_8hz_timestamp);GET(*s->clk_timer_16hz_timestamp);GET(*s->clk_timer_32hz_timestamp);
  GET(*s->clk_timer_64hz_timestamp);GET(*s->clk_timer_128hz_timestamp);GET(*s->clk_timer_256hz_timestamp);
  GET(*s->prog_timer_timestamp);GET(*s->prog_timer_enabled);GET(*s->prog_timer_data);GET(*s->prog_timer_rld);GET(*s->call_depth);
  for(int i=0;i<INT_SLOT_NUM;i++){GET(s->interrupts[i].factor_flag_reg);GET(s->interrupts[i].mask_reg);GET(s->interrupts[i].triggered);}
  GET(*s->cpu_halted);
  if(pos+MEM_BUFFER_SIZE*sizeof(MEM_BUFFER_TYPE)!=length)return -1;
  memcpy(s->memory,buf+pos,MEM_BUFFER_SIZE*sizeof(MEM_BUFFER_TYPE));
  memset(matrix,0,sizeof(matrix));memset(icons,0,sizeof(icons));tamalib_refresh_hw();return 0;
}
