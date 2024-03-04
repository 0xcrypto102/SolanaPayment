use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{ Mint, Token, TokenAccount,  Transfer, transfer},
};
use anchor_spl::token;
use solana_program::{program::{invoke, invoke_signed}, system_instruction};

declare_id!("8ZeCdtsSJmZRDVYtrdtNLhPRQckmjDwcFy2iELkr2XZA");

#[program]
pub mod sol_payment {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let mystate = &mut ctx.accounts.mystate;
        mystate.vault = ctx.accounts.vault.key();
        mystate.deposits = Vec::new();
        mystate.withdrawals = Vec::new();
        mystate.authorized_addresses = vec![ctx.accounts.signer.key()];
        mystate.deposit_index = 0;
        mystate.uid = 0;

        Ok(())
    }

    pub fn deposit_lamports(
        ctx: Context<TransferLamportsForDeposit>,
        amount: u64,
    ) -> Result<()> {
        let accts = ctx.accounts;
        // Create the transfer instruction
        let transfer_instruction =
            system_instruction::transfer(&accts.user.key(), &accts.vault.key(), amount);

        // Invoke the transfer instruction
        invoke(
            &transfer_instruction,
            &[
                accts.user.to_account_info().clone(),
                accts.vault.to_account_info().clone(),
                accts.system_program.to_account_info().clone(),
            ],
        )?;
        accts.mystate.deposit_index += 1;

        // Record the deposit
        let deposit = DepositInfo {
            deposit_index: accts.mystate.deposit_index,
            from: accts.user.key(),
            to: accts.vault.key(),
            token_address: TokenAddress::String("SOL".to_string()),
            amount,
        };
        accts.mystate.deposits.push(deposit.clone());
        accts.deposit_info_account.deposits.push(deposit);

        Ok(())
    }

    pub fn deposit_spl(
        ctx: Context<TransferSplForDeposit>,
        amount: u64,
    ) -> Result<()> {
        let accts = ctx.accounts;

        // Transfer tokens from taker to initializer
        let cpi_accounts = Transfer {
            from: accts.from_ata.to_account_info(),
            to: accts.vault_for_ata.to_account_info(),
            authority: accts.user.to_account_info(),
        };
        let cpi_program = accts.token_program.to_account_info();

        token::transfer(CpiContext::new(cpi_program, cpi_accounts), amount)?;

        // let cpi_ctx = CpiContext::new(
        //     accts.token_program.to_account_info(),
        //     Transfer {
        //         from: accts.from_ata.to_account_info(),
        //         to: accts.vault_for_ata.to_account_info(),
        //         authority: accts.user.to_account_info(),
        //     },
        // );
    
        // transfer(
        //     cpi_ctx,
        //     amount
        // )?;

        accts.mystate.deposit_index += 1;

        // Record the deposit
        let deposit = DepositInfo {
            deposit_index: accts.mystate.deposit_index,
            from: accts.user.key(),
            to: accts.vault_for_ata.key(),
            token_address: TokenAddress::Pubkey(accts.token_for_deposit.key()),
            amount,
        };
        accts.mystate.deposits.push(deposit.clone());
        accts.deposit_info_account.deposits.push(deposit);

        Ok(())
    }

    pub fn withdraw_lamports(
        ctx: Context<TransferLamportsForWithdraw>,
        amount: u64,
        message: String
    ) -> Result<()> {
        let accts = ctx.accounts;

        if !accts.mystate
            .authorized_addresses
            .contains(&accts.user.key())
        {
            return Err(PaymentError::Unauthorized.into());
        }

        if amount == 0 {
            return Err(PaymentError::InvalidAmount.into());
        }

        let (_, bump) = Pubkey::find_program_address(&[b"VAULT-SEED"], &crate::ID);

        // Create the transfer instruction
        invoke_signed(
            &system_instruction::transfer(&accts.vault.key(), &accts.user.key(), amount),
            &[
                accts.vault.to_account_info().clone(),
                accts.user.to_account_info().clone(),
                accts.system_program.to_account_info().clone(),
            ],
            &[&[b"VAULT-SEED", &[bump]]],
        )?;

        accts.mystate.uid += 1;

        // Record the deposit
        let withdraw = Withdrawal {
            uid: accts.mystate.uid,
            from: accts.vault.key(),
            to: accts.user.key(),
            token_address: TokenAddress::String("SOL".to_string()),
            amount,
            message,
        };
        accts.mystate.withdrawals.push(withdraw.clone());
        accts.withdraw_info_account.withdrawals.push(withdraw);

        Ok(())
    }

    pub fn withdraw_spl(
        ctx: Context<TransferSplForWithdraw>,
        amount: u64,
        message: String,
    ) -> Result<()> {
        let accts = ctx.accounts;

        if !accts.mystate
            .authorized_addresses
            .contains(&accts.user.key())
        {
            return Err(PaymentError::Unauthorized.into());
        }

        if amount == 0 {
            return Err(PaymentError::InvalidAmount.into());
        }

        let binding = accts.token_for_withdraw.key();
        let (_, bump) = Pubkey::find_program_address(&[b"SPL-STATE-SEED", binding.as_ref()], ctx.program_id);
        let vault_seeds = &[b"SPL-STATE-SEED", binding.as_ref(), &[bump]];
        let signer = &[&vault_seeds[..]];
        
        let cpi_ctx = CpiContext::new_with_signer(
            accts.token_program.to_account_info(),
            Transfer {
                from: accts.vault_for_ata.to_account_info(),
                to: accts.to_ata.to_account_info(),
                authority: accts.mystate.to_account_info(),
            },
            signer,
        );
        transfer(cpi_ctx, amount)?;

        accts.mystate.uid += 1;

        // Record the deposit
        let withdraw = Withdrawal {
            uid: accts.mystate.uid,
            from: accts.vault_for_ata.key(),
            to: accts.user.key(),
            token_address: TokenAddress::Pubkey(accts.token_for_withdraw.key()),
            amount,
            message,
        };

        accts.mystate.withdrawals.push(withdraw.clone());
        accts.withdraw_info_account.withdrawals.push(withdraw);

        Ok(())
    }

    pub fn add_authorized_address(
        ctx: Context<AuthorizedAddress>,
        new_address: Pubkey,
    ) -> Result<()> {
        let mystate = &mut ctx.accounts.mystate;

        // Check if the sender is an authorized address
        if !mystate
            .authorized_addresses
            .contains(&ctx.accounts.authority.key())
        {
            return Err(PaymentError::Unauthorized.into());
        }

        // Check if the new address is already authorized
        if mystate.authorized_addresses.contains(&new_address) {
            return Err(PaymentError::AddressAlreadyAuthorized.into());
        }

        // Add the new address to the list of authorized addresses
        mystate.authorized_addresses.push(new_address);

        Ok(())
    }

    pub fn remove_authorized_address(
        ctx: Context<AuthorizedAddress>,
        address_to_remove: Pubkey,
    ) -> Result<()> {
        let mystate = &mut ctx.accounts.mystate;

        // Check if the sender is an authorized address
        if !mystate
            .authorized_addresses
            .contains(&ctx.accounts.authority.key())
        {
            return Err(PaymentError::Unauthorized.into());
        }

        // Find the index of the address to remove
        let index = mystate
            .authorized_addresses
            .iter()
            .position(|&addr| addr == address_to_remove)
            .ok_or(PaymentError::AddressNotFound)?;

        // Remove the address from the authorized addresses
        mystate.authorized_addresses.remove(index);

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        init_if_needed, 
        seeds = [b"MY-STATE-SEED"],
        bump,         
        space = 9000,
        payer = signer,
    )]
    pub mystate: Account<'info, MyState>,

    /// CHECK:` doc comment explaining why no checks through types are necessary.
    #[account(
        mut,
        seeds = [b"VAULT-SEED"],
        bump
    )]
    pub vault: AccountInfo<'info>, // to receive SOL
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransferLamportsForDeposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"MY-STATE-SEED"],
        bump,
    )]
    pub mystate: Account<'info, MyState>,
    /// CHECK:` doc comment explaining why no checks through types are necessary.
    #[account(
        mut,
        address = mystate.vault,
    )]
    pub vault: AccountInfo<'info>,

    #[account(
        init_if_needed,
        payer = user,
        seeds = [b"DEPOSIT-STATE-SEED", user.key().as_ref()],
        bump,
        space = 9000
    )]
    pub deposit_info_account: Account<'info, DepositWallet>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransferSplForDeposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"MY-STATE-SEED"],
        bump,
    )]
    pub mystate: Account<'info, MyState>,

    #[account(
        mut
    )]
    pub token_for_deposit: Account<'info, Mint>,

    #[account(mut)]
    pub from_ata: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = user,
        seeds = [b"SPL-STATE-SEED", token_for_deposit.key().as_ref()],
        bump,
        token::mint = token_for_deposit,
        token::authority = mystate,
    )]
    pub vault_for_ata: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = user,
        seeds = [b"DEPOSIT-STATE-SEED", user.key().as_ref()],
        bump,
        space = 9000
    )]
    pub deposit_info_account: Account<'info, DepositWallet>,
   
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransferLamportsForWithdraw<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"MY-STATE-SEED"],
        bump,
    )]
    pub mystate: Account<'info, MyState>,

    /// CHECK:` doc comment explaining why no checks through types are necessary.
    #[account(
        mut,
        address = mystate.vault,
    )]
    pub vault: AccountInfo<'info>,
    
    #[account(
        init_if_needed,
        payer = user,
        seeds = [b"WITHDRAW-STATE-SEED", user.key().as_ref()],
        bump,
        space = 9000
    )]
    pub withdraw_info_account: Account<'info, WithdrawWallet>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransferSplForWithdraw<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"MY-STATE-SEED"],
        bump,
    )]
    pub mystate: Account<'info, MyState>,

    #[account(
        mut
    )]
    pub token_for_withdraw: Account<'info, Mint>,

    #[account(
        mut
    )]
    pub to_ata: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"SPL-STATE-SEED",token_for_withdraw.key().as_ref()],
        bump,
    )]
    pub vault_for_ata: Account<'info, TokenAccount>,
 
    #[account(
        init_if_needed,
        payer = user,
        seeds = [b"WITHDRAW-STATE-SEED", user.key().as_ref()],
        bump,
        space = 9000
    )]
    pub withdraw_info_account: Account<'info, WithdrawWallet>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct MyState {
    pub vault: Pubkey, // the PDA account to keep SOL
    pub deposits: Vec<DepositInfo>,
    pub withdrawals: Vec<Withdrawal>,
    pub authorized_addresses: Vec<Pubkey>,
    pub deposit_index: u64,
    pub uid: u64,
}

#[account]
pub struct DepositWallet {
    pub deposits: Vec<DepositInfo>,
}

#[account]
pub struct WithdrawWallet {
    pub withdrawals: Vec<Withdrawal>,
}

#[derive(Debug, AnchorDeserialize, AnchorSerialize, Default, Clone)]
pub struct DepositInfo {
    pub deposit_index: u64, // Deposit index information
    pub from: Pubkey,       // Sender's token account
    pub to: Pubkey,         // Receiver's token account (contract's account)
    pub token_address: TokenAddress, // token address
    pub amount: u64,        // Amount of tokens deposited
}

#[derive(Debug, AnchorDeserialize, AnchorSerialize, Default, Clone)]
pub struct Withdrawal {
    pub uid: u64,        // Withdrawal UID
    pub from: Pubkey,    // Sender's token account (contract's account)
    pub to: Pubkey,      // Receiver's token account
    pub token_address: TokenAddress, // token address
    pub amount: u64,     // Amount of tokens withdrawn
    pub message: String, // Withdrawal message
}

#[derive(Accounts)]
pub struct AuthorizedAddress<'info> {
    #[account(mut)]
    pub mystate: Account<'info, MyState>, // State account of the smart contract
    pub authority: Signer<'info>, // Sender's authority
}

// Define an enum to hold either a Pubkey or a String
#[derive(AnchorSerialize, AnchorDeserialize, Debug,  Clone)]
pub enum TokenAddress {
    Pubkey(Pubkey),
    String(String),
}

impl Default for TokenAddress {
    fn default() -> Self {
        // Choose a default value, for example, an empty string
        TokenAddress::String(String::default())
    }
}

#[error_code]
pub enum PaymentError {
    #[msg("Your address can't authorize the this transaction")]
    Unauthorized,
    #[msg("Amount should be more than 0")]
    InvalidAmount,
    #[msg("This address has been already authorized")]
    AddressAlreadyAuthorized,
    #[msg("Sorry, that address is not valid")]
    AddressNotFound,
}
